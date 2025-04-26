// app/project/[projectId]/page.tsx
import { redirect, notFound } from "next/navigation";
import { auth } from "@/auth";
import { getProjectDetails } from "@/lib/data/projects";

interface PageProps {
  params: {
    projectId: string;
  };
}

export default async function ProjectRedirectPage({ params }: PageProps) {
  const { projectId } = params;

  const session = await auth();
  if (!session?.user?.id) {
    redirect(`/login?callbackUrl=/project/${projectId}/overview`);
  }

  const result = await getProjectDetails(projectId);

  if (result) {
    redirect(`/project/${projectId}/overview`);
  } else {
    notFound();
  }
}
