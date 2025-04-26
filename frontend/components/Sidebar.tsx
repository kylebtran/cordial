// components/Sidebar.tsx
"use client";
import {
  MessagesSquareIcon,
  PanelsTopLeftIcon,
  SettingsIcon,
  UsersIcon,
} from "lucide-react";
import Link from "next/link";
import React, { useMemo } from "react";

export function Sidebar({
  projectId,
  projectName,
  userName,
  userRole,
}: {
  projectId: string;
  projectName: string;
  userName: string;
  userRole: string;
}) {
  const tabs = useMemo(() => {
    return [
      {
        name: "Overview",
        href: `/project/${projectId}/overview`,
        icon: <PanelsTopLeftIcon width={20} strokeWidth={1.5} />,
      },
      {
        name: "Chat",
        href: `/project/${projectId}/chat`,
        icon: <MessagesSquareIcon width={20} strokeWidth={1.5} />,
      },
      {
        name: "Members",
        href: `/project/${projectId}/members`,
        icon: <UsersIcon width={20} strokeWidth={1.5} />,
      },
    ];
  }, []);

  return (
    <div className="w-[224px] h-screen p-4 flex flex-col gap-4 bg-gradient-to-b from-transparent to-[#0E0E10]/70">
      <Link href="/project" className="font-serif text-2xl">
        CORDIAL
      </Link>

      {/* Project dropdown */}
      <div className="flex items-center space-x-3">
        <div className="min-w-5 min-h-5 bg-outline" />
        <span className="truncate font-semibold">{projectName}</span>
      </div>

      <Bar />
      <div className="flex flex-col gap-4 font-medium">
        {tabs.map((tab) => (
          <Link
            key={tab.name}
            href={tab.href}
            className="flex items-center space-x-3"
          >
            {tab.icon}
            <span>{tab.name}</span>
          </Link>
        ))}
      </div>
      <div className="mt-auto mb-1">
        <div className="flex flex-col gap-4 font-medium">
          <Link
            key="Settings"
            href={"/settings"}
            className="flex items-center space-x-3"
          >
            <SettingsIcon width={20} strokeWidth={1.5} />
            <span>Settings</span>
          </Link>

          <Link
            key="User"
            href={"/user"}
            className="flex items-center space-x-3"
          >
            <div className="min-w-5 min-h-5 bg-outline rounded-full" />
            <span>{userName}</span>
            <span className="ml-auto bg-outline/40 outline outline-outline text-accent px-2 py-0.2 rounded font-mono">
              {userRole}
            </span>
          </Link>
        </div>
      </div>
    </div>
  );
}

function Bar() {
  return <div className="w-[224px] bg-outline h-[1px] -ml-4" />;
}
