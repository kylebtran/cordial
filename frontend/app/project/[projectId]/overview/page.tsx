// app/project/[projectId]/overview/page.tsx
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { getProjectDetails } from "@/lib/data/projects";
import { getConversationsForUserInProject } from "@/lib/data/conversations";
import type { Project, Conversation } from "@/lib/data/types";

interface PageProps {
  params: {
    projectId: string;
  };
}

// export default async function ProjectOverviewPage({ params }: PageProps) {
//   const { projectId } = params;

//   const session = await auth();
//   if (!session?.user?.id) {
//     redirect(`/login?callbackUrl=/project/${projectId}/overview`);
//   }

//   // --- Permission Check: Project Membership ---
//   const result = await getProjectDetails(projectId);

//   if (!result) {
//     console.log(
//       `Overview: Access denied or project not found: ${projectId}, User: ${session.user.id}`
//     );
//     notFound();
//   }

//   const { project, userRole } = result;

//   // --- Fetch User-Specific Conversations ---
//   const conversations: Conversation[] = await getConversationsForUserInProject(
//     project._id
//   );

//   return (
//     <div className="container mx-auto p-4">
//       <header className="mb-6">
//         <h1 className="text-3xl font-bold mb-2">{project.name}</h1>
//         {project.description && (
//           <p className="text-gray-600">{project.description}</p>
//         )}
//       </header>

//       <hr className="my-6" />

//       <section>
//         <h2 className="text-2xl font-semibold mb-4">Your Conversations</h2>
//         {/* <CreateConversationButton projectId={project._id.toString()} /> */}
//         {conversations.length === 0 ? (
//           <p className="text-gray-500">
//             You haven't started any conversations in this project yet.
//           </p>
//         ) : (
//           <ul className="space-y-2">
//             {conversations.map((convo) => (
//               <li
//                 key={convo._id.toString()}
//                 className="p-3 border rounded hover:bg-gray-50"
//               >
//                 <Link
//                   href={`/project/${projectId}/chat/${convo._id.toString()}`}
//                   className="block"
//                 >
//                   <span className="font-medium">
//                     {convo.title ||
//                       `Chat started ${convo.createdAt.toLocaleDateString()}`}
//                   </span>
//                   <span className="text-sm text-gray-400 block">
//                     Updated: {convo.updatedAt.toLocaleTimeString()}
//                   </span>
//                 </Link>
//               </li>
//             ))}
//           </ul>
//         )}
//       </section>
//     </div>
//   );
// }

export default async function ProjectOverviewPage({ params }: PageProps) {
  const { projectId } = params;

  // Auth and project access are already checked by the layout,
  // but we might need the project data and role again for overview-specific content.
  const session = await auth(); // Still useful to have session info if needed
  const projectResult = await getProjectDetails(projectId);

  // If layout check passed, this should also pass, but check defensively.
  if (!projectResult || !session?.user) {
    notFound();
  }
  const { project, userRole } = projectResult;

  // ---- Overview Page Specific Content ----
  // The conversation list is now likely in the sidebar via the layout.
  // This page can focus on project-level details, settings, stats, etc.

  return (
    <div className="p-6">
      {/* Header might be redundant if similar info is in layout sidebar */}
      <h1 className="text-2xl font-bold mb-4">
        Project Overview: {project.name}
      </h1>
      <p className="mb-4">
        {project.description || "No description provided."}
      </p>

      <div className="bg-white p-4 rounded shadow">
        <h2 className="text-lg font-semibold mb-2">Project Details</h2>
        <p>
          <strong>Owner ID:</strong> {project.ownerId.toString()}
        </p>
        <p>
          <strong>Your Role:</strong> {userRole}
        </p>
        <p>
          <strong>Created:</strong> {project.createdAt.toLocaleDateString()}
        </p>
        {/* Add more project stats, links to settings (role-dependent), member list etc. */}
      </div>
    </div>
  );
}
