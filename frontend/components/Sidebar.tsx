// components/Sidebar.tsx
"use client";
import { MessagesSquareIcon, PanelsTopLeftIcon, UsersIcon } from "lucide-react";
import Link from "next/link";
import React, { useMemo } from "react";

export function Sidebar({
  projectId,
  projectName,
  userRole,
}: {
  projectId: string;
  projectName: string;
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
    <div className="w-[224px] h-screen p-4 flex flex-col gap-4">
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
      {userRole}
    </div>
  );
}

function Bar() {
  return <div className="w-[224px] bg-outline h-[1px] -ml-4" />;
}
