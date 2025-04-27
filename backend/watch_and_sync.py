#!/usr/bin/env python3
"""
Real-time bridge: MongoDB ↔ Gemini ↔ Jira   –  DEBUG / ROBUST build
• only triggers on user messages
• picks the best Jira card and moves it to In Progress / Done
• prints detailed diagnostics prefixed with [dbg]
"""

import os, json, asyncio, pprint, math, re, warnings, traceback, sys
from typing import List, Dict, Any, Tuple, Optional
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
import google.generativeai as genai
from google.generativeai import GenerationConfig
from mcp import ClientSession
from mcp.client.sse import sse_client

# ─────── configuration ───────
load_dotenv()
MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017")
DB_NAME, CONV_COLL, PROJ_COLL = "test", "conversations", "projects"
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
GEMINI_MODEL   = os.getenv("GEMINI_MODEL", "gemini-2.0-flash")
EMBED_MODEL    = os.getenv("EMBED_MODEL", "models/embedding-001")
MCP_SSE_URL    = os.getenv("MCP_SSE_URL", "http://localhost:9000/sse")

genai.configure(api_key=GEMINI_API_KEY)

# ─────── GEMINI tools (unchanged) ───────
tool_specs = [
    {
        "name": "find_matching_issue",
        "description": "Return the best Jira issue key for a sentence",
        "parameters": {
            "type": "OBJECT",
            "properties": {"userText": {"type": "STRING"}},
            "required": ["userText"],
        },
    },
    {
        "name": "transition_issue",
        "description": "Move a Jira issue to a new workflow status",
        "parameters": {
            "type": "OBJECT",
            "properties": {
                "issueKey":  {"type": "STRING"},
                "newStatus": {"type": "STRING",
                              "enum": ["To Do", "In Progress", "Done"]},
            },
            "required": ["issueKey", "newStatus"],
        },
    },
]

gem_model = genai.GenerativeModel(
    model_name=GEMINI_MODEL,
    tools=tool_specs,
    generation_config=GenerationConfig(
        temperature=0.0, top_p=1.0, top_k=1, candidate_count=1
    ),
)

# ─────── Mongo clients ───────
mongo    = AsyncIOMotorClient(MONGO_URI, uuidRepresentation="standard")
conv_col = mongo[DB_NAME][CONV_COLL]
proj_col = mongo[DB_NAME][PROJ_COLL]

# ─────── helper: debug print ───────
def _dbg(label:str,*args):
    print(f"[dbg] {label}:",*args,flush=True)

# ─────── only act on user messages ───────
def _is_user_message(entry:Dict[str,Any])->bool:
    role = (entry.get("role")
            or entry.get("author")
            or entry.get("sender")
            or "").lower()
    return role in {"user","human","customer"}

# ─────── prompt scaffolding ───────
SYS_PROMPT = """You are an AI Jira assistant.

Reply with:
• {"action":"update_status","params":{"issueKey":"<JIRA-123>","newStatus":"<In Progress|Done>"}}
• {"action":"find_issue","params":{"userText":"<message>"}} when you must locate the card.
• {"action":"none"} if the message is not about task progress.

Progress cues → In Progress: started, begin, working on  
Progress cues → Done: finished, completed, done, implemented
"""

_json_re = re.compile(r"{.*}", re.S)
def _safe_json(txt:str)->Optional[dict]:
    m=_json_re.search(txt or "")
    if m:
        try: return json.loads(m.group(0))
        except json.JSONDecodeError: pass
    return None

def _build_prompt(conv:dict)->List[dict]:
    last=conv["messages"][-1]["content"]
    recent=pprint.pformat(conv["messages"][-5:])
    return [
        {"role":"user","parts":[{"text":f"{SYS_PROMPT}\n\nUSER MESSAGE: {last}"}]},
        {"role":"model","parts":[{"text":"Recent messages:\n"+recent}]},
    ]

# ─────── Jira JSON helpers ───────
def _issues_from_part(part: dict) -> List[dict]:
    if "json" in part and "issues" in part["json"]:
        return part["json"]["issues"]
    txt=part.get("text","") or ""
    m=re.search(r"\{.*\"issues\"\s*:\s*\[.*?\]\s*\}",txt,re.S)
    if m:
        try: return json.loads(m.group(0))["issues"]
        except Exception: pass
    return []

def _extract_transitions(part: Dict[str,Any]) -> List[dict]:
    if "json" in part and "transitions" in part["json"]:
        return part["json"]["transitions"]
    txt=part.get("text","") or ""
    try:
        obj=json.loads(txt)
        if isinstance(obj,list): return obj
        if isinstance(obj,dict) and "transitions" in obj: return obj["transitions"]
    except Exception: pass
    for blob in re.findall(r"\{.*?\}",txt,re.S):
        try:
            ob=json.loads(blob)
            if "transitions" in ob: return ob["transitions"]
        except json.JSONDecodeError: pass
    return []

async def _process(rs)->Dict[str,Any]:
    rs=rs.model_dump() if hasattr(rs,"model_dump") else rs.dict()
    if rs.get("isError"):
        return {"status":"error","message":rs["content"][0]["text"]}
    return {"status":"success","data":rs}

# ─────── cosine + embed helpers ───────
def cosine(a,b):
    dot=sum(x*y for x,y in zip(a,b))
    na=math.sqrt(sum(x*x for x in a)); nb=math.sqrt(sum(y*y for y in b))
    return dot/((na or 1e-9)*(nb or 1e-9))

async def embed(text:str):
    return genai.embed_content(model=EMBED_MODEL,
                               content=text,
                               task_type="SEMANTIC_SIMILARITY").embedding

# ─────── improved find_jira_issue ───────
async def find_jira_issue(mcp:ClientSession,jira_key:str,query:str)->Tuple[bool,Dict[str,Any]]:
    # build token list
    tokens=[t.lower() for t in re.split(r"\W+",query) if len(t)>2]
    # special case "front end" → "frontend"
    if "front" in tokens and "end" in tokens and "frontend" not in tokens:
        tokens.append("frontend")
    _dbg("tokens",tokens)

    # 1️⃣ keyword JQL
    if tokens:
        jql=f'project = "{jira_key}" AND ('+" OR ".join(f'text ~ \"{t}\"' for t in tokens)+")"
        _dbg("JQL",jql)
        rs=await mcp.call_tool("jira_search",
            {"jql":jql,"fields":["key","summary","description"],"limit":10})
        pr=await _process(rs)
        if pr["status"]!="error":
            issues=_issues_from_part(pr["data"]["content"][0])
            _dbg("keyword hits",[(i["key"],i["summary"]) for i in issues])
            if issues:
                # simple token-overlap score
                def score(doc):
                    text=(doc["summary"]+" "+(doc.get("description") or "")).lower()
                    return sum(tok in text for tok in tokens)
                best=max(issues,key=score)
                _dbg("keyword best",best["key"],score(best))
                return True,{"issue_key":best["key"]}

    # 2️⃣ semantic fallback
    rs2=await mcp.call_tool("jira_search",
        {"jql":f'project = "{jira_key}" ORDER BY updated DESC',
         "fields":["key","summary","description"],"limit":50})
    pr2=await _process(rs2)
    if pr2["status"]=="error": return False,pr2
    issues=_issues_from_part(pr2["data"]["content"][0])
    _dbg("semantic candidates",len(issues))
    if not issues: return False,{"status":"error","message":"Project empty"}

    q_vec=await embed(query)
    best=None;best_sc=0.0
    for it in issues:
        txt=f"{it.get('summary','')} {it.get('description','') or ''}"
        sc=cosine(q_vec,await embed(txt))
        if sc>best_sc: best_sc=sc; best=it["key"]
    _dbg("semantic best",best,best_sc)
    return (True,{"issue_key":best}) if best_sc>=0.55 else (False,{"status":"error","message":"No match"})

# ─────── transition helper ───────
async def transition_jira_issue(mcp:ClientSession,issue_key:str,new_status:str)->Dict[str,Any]:
    raw=await mcp.call_tool("jira_get_transitions",{"issue_key":issue_key})
    info=await _process(raw)
    if info["status"]=="error": return info
    trans=_extract_transitions(info["data"]["content"][0])
    _dbg("transitions",[(t["id"],t["name"]) for t in trans])
    tid=next((t["id"] for t in trans
              if t.get("name","").lower()==new_status.lower()),None)
    _dbg("picked tid",tid)
    if not tid: return {"status":"error","message":f"No transition to {new_status}"}
    res=await mcp.call_tool("jira_transition_issue",
            {"issue_key":issue_key,"transition_id":tid})
    return await _process(res)

# ─────── dispatcher ───────
async def process_action(mcp:ClientSession,jira_key:str,action:Dict[str,Any])->Dict[str,Any]:
    a=action.get("action"); p=action.get("params",{})
    if a=="find_issue":
        ok,res=await find_jira_issue(mcp,jira_key,p.get("userText",""))
        if not ok: return res
        issue=res["issue_key"]
        txt=p.get("userText","")
        new_status="Done" if re.search(r"\b(done|finished|completed|implemented)\b",txt,re.I) else "In Progress"
        return await transition_jira_issue(mcp,issue,new_status)
    if a=="update_status":
        issue=p.get("issueKey")
        if not issue:
            ok,res=await find_jira_issue(mcp,jira_key,p.get("userText",""))
            if not ok: return res
            issue=res["issue_key"]
        return await transition_jira_issue(mcp,issue,p["newStatus"])
    return {"status":"error","message":"Unknown action"}

# ─────── main loop ───────
async def main_loop():
    print(f"[startup] Connecting to MCP SSE @ {MCP_SSE_URL} …")
    async with sse_client(MCP_SSE_URL) as (r,w):
        async with ClientSession(r,w) as mcp:
            await mcp.initialize(); print("[startup] MCP session initialised ✅")
            pipeline=[{"$match":{"operationType":"update"}}]
            print(f"[watch] Waiting for updates on {DB_NAME}.{CONV_COLL} …")
            async with conv_col.watch(pipeline,full_document="updateLookup") as stream:
                async for change in stream:
                    try:
                        conv=change["fullDocument"]
                        last=conv["messages"][-1]
                        _dbg("last_entry", last)         #  👈  add this line
                        if not _is_user_message(last):
                            _dbg("skip","assistant message"); continue
                        msg=last["content"]
                        proj=await proj_col.find_one({"_id":conv["projectId"]})
                        jira_key=proj.get("jiraProjectId") if proj else None
                        print(f"\n[event] Mongo updated ➜ {msg!r}")
                        if not jira_key:
                            print("   ⚠️  no Jira project linked – skip"); continue

                        prompt=_build_prompt(conv)
                        rsp=gem_model.generate_content(contents=prompt)
                        part=rsp.candidates[0].content.parts[0]
                        action=_safe_json(getattr(part,"text",None)) or {"action":"none"}
                        if action["action"]=="none":
                            print("[gemini] → no Jira action"); continue
                        print("[gemini] →",json.dumps(action,indent=2))

                        res=await process_action(mcp,jira_key,action)
                        if res["status"]=="error":
                            print("[mcp] ❌",res["message"])
                        else:
                            print("[mcp] ✅",json.dumps(res["data"],indent=2))
                    except Exception:
                        print("[error] unexpected exception — continuing")
                        traceback.print_exc(file=sys.stdout)
                        continue

async def main():
    while True:
        try: await main_loop()
        except Exception:
            traceback.print_exc(); await asyncio.sleep(5)

if __name__=="__main__":
    asyncio.run(main())
