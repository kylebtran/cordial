// components/Sidebar.tsx
"use client";
import {
  ChevronsUpDownIcon,
  Loader2Icon,
  LoaderCircleIcon,
  MessagesSquareIcon,
  PanelsTopLeftIcon,
  PlusIcon,
  SettingsIcon,
  UsersIcon,
  XIcon,
} from "lucide-react";
import Link from "next/link";
import React, { FormEvent, useMemo, useState, useTransition } from "react";
import { createNewProjectAction } from "@/server/actions/projects";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./ui/dialog";
import { Label } from "./ui/label";
import { Input } from "./ui/input";
import { Button } from "./ui/button";

interface SidebarProjectInfo {
  id: string;
  name: string;
}

export function Sidebar({
  projectId,
  projectName,
  userName,
  userRole,
  userProjects,
}: {
  projectId: string;
  projectName: string;
  userName: string;
  userRole: string;
  userProjects: SidebarProjectInfo[];
}) {
  const router = useRouter();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

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
  }, [projectId]);

  const handleCreateProject = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    if (!newProjectName.trim()) {
      setError("Project name cannot be empty.");
      return;
    }
    startTransition(async () => {
      const result = await createNewProjectAction({ name: newProjectName });
      if (result?.error) {
        setError(result.error);
      } else {
        setNewProjectName("");
        setIsModalOpen(false);
      }
    });
  };

  const handleSwitchProject = (selectedProjectId: string) => {
    console.log(`Switching to project: ${selectedProjectId}`);
    // Navigate to the overview page of the selected project
    router.push(`/project/${selectedProjectId}/overview`);
    // Note: A full page navigation will occur, reloading the layout
    // and thus re-fetching data for the new project context.
  };

  const handleModalOpenChange = (open: boolean) => {
    setIsModalOpen(open);
    if (!open) {
      // Reset form when dialog is closed
      setNewProjectName("");
      setError(null);
    }
  };

  return (
    <>
      <div className="w-[224px] h-screen p-4 flex flex-col gap-4 bg-gradient-to-b from-transparent to-[#0E0E10]/70">
        <Link href="/project" className="font-serif text-2xl">
          CORDIAL
        </Link>

        {/* Project dropdown */}
        {/* <div className="flex items-center space-x-3">
          <div className="min-w-5 min-h-5 bg-outline" />
          <span className="truncate font-semibold">{projectName}</span>
        </div> */}
        <Dialog open={isModalOpen} onOpenChange={handleModalOpenChange}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              {/* Use Shadcn Button component for consistent trigger styling, or keep your div */}
              <button className="w-full flex items-center justify-between font-semibold hover:bg-gray-700/50">
                <div className="flex items-center space-x-2 truncate">
                  {/* Placeholder Icon */}
                  <div className="flex items-center justify-center min-w-5 min-h-5 bg-outline rounded text-white text-xs">
                    {projectName.charAt(0).toUpperCase()}
                  </div>
                  <span className="truncate text-gray-100">{projectName}</span>
                </div>
                <ChevronsUpDownIcon className="h-4 w-4 text-gray-400" />
              </button>
            </DropdownMenuTrigger>

            <DropdownMenuContent
              className="w-[200px] bg-background border-outline"
              align="start"
            >
              {userProjects.map((proj) => (
                <DropdownMenuItem
                  key={proj.id}
                  disabled={proj.id === projectId} // Disable the current project
                  onSelect={(e) => {
                    e.preventDefault(); // Good practice
                    if (proj.id !== projectId) {
                      // Prevent navigation if already selected
                      handleSwitchProject(proj.id);
                    }
                  }}
                  className={`hover:!bg-outline cursor-pointer px-2 py-1.5 ${
                    proj.id === projectId ? "opacity-50 cursor-default" : ""
                  }`}
                >
                  {/* Maybe add a checkmark for the current project? */}
                  <span>{proj.name}</span>
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={(e) => {
                  // onSelect is often better for menu items to prevent closing before action
                  e.preventDefault(); // Prevent any default behavior if necessary
                  setIsModalOpen(true); // Open the modal
                }}
                className="cursor-pointer hover:!bg-outline" // Make it clear it's clickable
              >
                <PlusIcon className="mr-2 h-4 w-4" />
                <span>Create New Project</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* --- Dialog Content (Modal) definition - remains sibling in JSX, but contextually linked by parent <Dialog> --- */}
          <DialogContent className="border-outline">
            <DialogHeader>
              <DialogTitle>Create New Project</DialogTitle>
              <DialogDescription>
                Enter a name for your new project. Click create when you're
                done.
              </DialogDescription>
            </DialogHeader>
            {/* Give the form an ID so the button in the footer can reference it */}
            <form
              id="create-project-form"
              onSubmit={handleCreateProject}
              className="grid gap-4 py-2"
            >
              <div className="flex flex-col gap-4">
                <Label htmlFor="projectName" className="text-right">
                  Name
                </Label>
                <Input
                  id="projectName"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  placeholder="Enter project name..."
                  className="border-outline focus-visible:ring-1"
                  required
                  maxLength={100}
                  disabled={isPending}
                />
              </div>
              {error && (
                <p className="col-span-4 text-sm text-red-600 dark:text-red-400 text-center">
                  {error}
                </p>
              )}
            </form>{" "}
            {/* Form ends here */}
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="secondary" disabled={isPending}>
                  Cancel
                </Button>
              </DialogClose>
              <Button
                type="submit"
                className="bg-outline/70 hover:bg-outline"
                form="create-project-form" // Associate button with the form
                disabled={isPending || !newProjectName.trim()}
                // No onClick needed here, type="submit" and form attribute handle it
              >
                {isPending ? (
                  <>
                    <Loader2Icon className="animate-spin mr-2 h-4 w-4" />{" "}
                    Creating...{" "}
                  </>
                ) : (
                  "Create Project"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        {/* --- End Project Dropdown / Dialog --- */}

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
              <span className="ml-auto bg-outline/40 outline outline-outline text-accent px-2 py-0.2 rounded font-mono uppercase">
                {userRole}
              </span>
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}

function Bar() {
  return <div className="w-[224px] bg-outline h-[1px] -ml-4" />;
}
