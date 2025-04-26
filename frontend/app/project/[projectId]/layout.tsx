// app/project/[projectId]/layout.tsx
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { getProjectDetails } from "@/lib/data/projects"; // Fetches project AND role
import { getConversationsForUserInProject } from "@/lib/data/conversations"; // Fetches user's convos in this project
import type {
  Project,
  Conversation,
  Role,
  SidebarConversationInfo,
} from "@/lib/data/types";
import { ChatSidebar } from "@/components/ChatSidebar"; // The client component sidebar
import { Sidebar } from "@/components/Sidebar";
import { getProjectsForUser, UserProjectInfo } from "@/server/actions/projects";

interface ProjectLayoutProps {
  params: {
    projectId: string; // From the folder name [projectId]
  };
  children: React.ReactNode; // The content of the nested page (overview or chat)
}

export default async function ProjectLayout({
  children,
  params,
}: ProjectLayoutProps) {
  const { projectId } = params;

  // --- Authentication & Project Access Check ---
  // This check runs for ALL routes nested under /project/[projectId]/*
  const session = await auth();
  if (!session?.user?.id) {
    // Redirect to login, preserving the intended destination (could be overview or specific chat)
    // We need the full path. A helper might be needed in middleware, or build it here.
    // For now, let's assume redirection targets the overview for simplicity if caught here.
    redirect(`/login?callbackUrl=/project/${projectId}/overview`);
  }
  const userId = session.user.id;

  const projectResult = await getProjectDetails(projectId);
  if (!projectResult) {
    console.log(
      `ProjectLayout: Access denied or project not found: ${projectId}, User: ${session.user.id}`
    );
    notFound(); // User shouldn't be in any page within this project ID
  }
  const { project, userRole } = projectResult;

  // --- Fetch Data for the Layout (Sidebar) ---
  // Get the list of conversations for the sidebar navigation
  const userProjects: UserProjectInfo[] = await getProjectsForUser(userId);
  const projectsForSidebar = userProjects.map((p) => ({
    id: p._id.toString(),
    name: p.name,
  }));
  const currentProjectForSidebar = {
    id: project._id.toString(),
    name: project.name,
  };
  const conversations: Conversation[] = await getConversationsForUserInProject(
    project._id
  );

  const sidebarConversations: SidebarConversationInfo[] = conversations.map(
    (convo) => ({
      _id: convo._id.toString(),
      title: convo.title,
      createdAt: convo.createdAt.toISOString(),
    })
  );

  return (
    <div className="flex h-screen overflow-hidden font-sans">
      <Sidebar
        projectId={currentProjectForSidebar.id}
        projectName={project.name}
        userName={session.user.name || "Guest"}
        userRole={userRole}
        userProjects={projectsForSidebar}
      />
      {/* Sidebar Component */}
      <ChatSidebar
        projectId={projectId} // Pass projectId for link generation/new chat action
        initialConversations={sidebarConversations} // Pass conversations to populate the sidebar
        projectName={project.name} // Pass project name for display
        userRole={userRole} // Pass role for potential display/logic
      />

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto mt-12">
        {/* The nested page (overview or chat/[slug]) will be rendered here */}
        {children}
      </main>
    </div>
  );
}
