#!/usr/bin/env python3
"""
Create Epics ➜ Stories ➜ Sub-tasks in every flavour of Jira Cloud.

• Company-managed → links by key
• Team-managed w/ Epic Link → links stories by key, sub-tasks by id
• Team-managed w/o Epic Link → links everything by id
"""

import json, os, sys, functools
from pathlib import Path
from typing import Dict, Any, List

from atlassian import Jira                       # pip install atlassian-python-api
from dotenv    import load_dotenv                # pip install python-dotenv
from requests.exceptions import HTTPError

# ── environment ─────────────────────────────────────────────────────────────
load_dotenv()
JIRA_URL, JIRA_USER, JIRA_API_TOKEN = map(os.getenv,
    ("JIRA_URL", "JIRA_USER", "JIRA_API_TOKEN"))
PROJECT_KEY = sys.argv[1] if len(sys.argv) > 1 else "AA"
if not all((JIRA_URL, JIRA_USER, JIRA_API_TOKEN)):
    sys.exit("✖  Missing JIRA_URL / JIRA_USER / JIRA_API_TOKEN")

# ── helpers ────────────────────────────────────────────────────────────────
def jira() -> Jira:
    return Jira(url=JIRA_URL, username=JIRA_USER,
                password=JIRA_API_TOKEN, cloud=True)

@functools.lru_cache(maxsize=None)
def issue_id(client: Jira, key: str) -> str:
    """ABC-123 → opaque numeric id (required as parent in team-managed)."""
    return client.get(f"rest/api/3/issue/{key}?fields=id")["id"]

def load(fname: str) -> List[Dict[str, Any]]:
    with Path(fname).open(encoding="utf-8") as fh:
        return json.load(fh)

def field_map(client: Jira) -> Dict[str, str]:
    return {f["name"]: f["id"] for f in client.get_all_fields()}

# ── creators ───────────────────────────────────────────────────────────────
def create_epic(client: Jira, epic: Dict[str, Any]) -> str:
    payload = {"fields": {
        "project": {"key": PROJECT_KEY},
        "summary": epic["title"],
        "description": epic.get("description", ""),
        "issuetype": {"name": "Epic"},
    }}
    return client.post("rest/api/2/issue", payload)["key"]

def create_story(client: Jira, fm: Dict[str, str],
                 story: Dict[str, Any], epic_key: str) -> str:
    epic_link = fm.get("Epic Link")
    fields = {
        "project": {"key": PROJECT_KEY},
        "summary": story["title"],
        "description": story.get("description", ""),
        "issuetype": {"name": "Story"},
    }

    # ① try Epic Link (company-managed or team-managed with field still enabled)
    if epic_link:
        try:
            return client.post("rest/api/2/issue",
                               {"fields": {**fields, epic_link: epic_key}})["key"]
        except HTTPError as e:
            if "cannot be set" not in e.response.text:
                raise
            print("↪  Epic Link rejected – switching to parent.id")

    # ② fall back to parent-link (required in next-gen w/o Epic Link)
    payload = {"parent": {"id": issue_id(client, epic_key)}, "fields": fields}
    return client.post("rest/api/2/issue", payload)["key"]

def create_subtask(client: Jira, story_key: str,
                   task: Dict[str, Any], assignees: Dict[str, str]) -> str:

    fields = {
        "project": {"key": PROJECT_KEY},
        "summary": task["title"],
        "description": task.get("description", ""),
        "issuetype": {"name": "Sub-task"},
    }
    # optional assignee
    email = task.get("assigned_user_email") or task.get("assigned_user")
    aid   = assignees.get(email)
    if aid:
        fields["assignee"] = {"id": aid}

    # ① try parent.key (works in company-managed)
    try:
        return client.post("rest/api/2/issue",
                           {"parent": {"key": story_key}, "fields": fields})["key"]
    except HTTPError as e:
        if e.response.status_code != 400:
            raise
        # ② retry with parent.id (team-managed)
        payload = {"parent": {"id": issue_id(client, story_key)}, "fields": fields}
        return client.post("rest/api/2/issue", payload)["key"]

# ── misc ───────────────────────────────────────────────────────────────────
def account_map(client: Jira) -> Dict[str, str]:
    out, start = {}, 0
    while True:
        users = client.get(f"rest/api/3/users/search?startAt={start}&maxResults=50")
        if not users:
            break
        for u in users:
            aid = u["accountId"]
            out[u["displayName"]] = aid
            if u.get("emailAddress"):
                out[u["emailAddress"]] = aid
        start += 50
    return out

# ── driver ─────────────────────────────────────────────────────────────────
def main() -> None:
    root = Path.cwd()
    epics, stories, tasks = map(load, ("epics.json", "stories.json", "tasks.json"))

    client = jira()
    fm     = field_map(client)
    assignees = account_map(client)

    epic_key, story_key = {}, {}

    for e in epics:
        k = create_epic(client, e); epic_key[e["id"]] = k
        print(f"📗 Epic   {e['title']}  →  {k}")

    for s in stories:
        k = create_story(client, fm, s, epic_key[s["epic_id"]])
        story_key[s["id"]] = k
        print(f"  📘 Story {s['title']}  →  {k}")

    for t in tasks:
        k = create_subtask(client, story_key[t["story_id"]], t, assignees)
        print(f"    📒 Task  {t['title']}  →  {k}")

if __name__ == "__main__":
    main()
