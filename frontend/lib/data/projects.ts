// lib/data/projects.ts
import clientPromise from "@/lib/db"; // Your MongoDB client promise
import { ObjectId } from "mongodb";
import { auth } from "@/auth"; // Auth.js helper to get session
import type { Membership, Project, Role } from "@/lib/data/types"; // Import the Project type

/**
 * Checks if the current user is a member of a specific project and returns
 * the project details along with the user's role if they are.
 *
 * @param projectId The ID of the project to check.
 * @returns An object { project: Project, userRole: ProjectRole } if user is a member, otherwise null.
 */
export async function getProjectDetails(
  projectId: string | ObjectId
): Promise<{ project: Project; userRole: Role } | null> {
  const session = await auth();
  if (!session?.user?.id) {
    console.log("getProjectDetails: No session found.");
    return null;
  }

  let projIdObject: ObjectId;
  try {
    projIdObject =
      typeof projectId === "string" ? new ObjectId(projectId) : projectId;
  } catch (e) {
    console.error(
      "getProjectDetails: Invalid Project ID format.",
      projectId,
      e
    );
    return null;
  }

  const userIdObject = new ObjectId(session.user.id);

  try {
    const client = await clientPromise;
    const db = client.db();
    const membershipsCollection = db.collection<Membership>("memberships");
    const projectsCollection = db.collection<Project>("projects");

    const membership = await membershipsCollection.findOne({
      projectId: projIdObject,
      userId: userIdObject,
    });

    if (!membership) {
      console.log(
        `getProjectDetails: User ${userIdObject} not found in project ${projIdObject}`
      );
      return null;
    }

    const project = await projectsCollection.findOne({
      _id: projIdObject,
    });

    if (!project) {
      console.log(
        `getProjectIfMember: Project ${projectId} not found or user ${session.user.id} is not a member.`
      );
      return null;
    }

    console.log(
      `getProjectIfMember: User ${session.user.id} accessed project ${projectId}.`
    );
    return { project, userRole: membership.role };
  } catch (error) {
    console.error(
      "getProjectIfMember: Database error fetching project.",
      error
    );
    return null;
  }
}

/**
 * Fetches all projects where the currently logged-in user is a member.
 * Useful for a dashboard or project list page.
 *
 * @returns An array of Project documents the user is a member of.
 */
export async function getProjectsForCurrentUser(): Promise<Project[]> {
  const session = await auth();
  if (!session?.user?.id) {
    console.log("getProjectsForCurrentUser: No session found.");
    return [];
  }

  const userIdObject = new ObjectId(session.user.id);

  try {
    const client = await clientPromise;
    const db = client.db();
    const membershipsCollection = db.collection<Membership>("memberships");
    const projectsCollection = db.collection<Project>("projects");

    // 1. Find all memberships for the current user
    const userMemberships = await membershipsCollection
      .find({ userId: userIdObject })
      .toArray();

    if (userMemberships.length === 0) {
      return []; // User is not a member of any projects
    }

    // 2. Extract the project IDs from the memberships
    const projectIds = userMemberships.map((mem) => mem.projectId);

    // 3. Fetch the actual project documents using the extracted IDs
    const projects = await projectsCollection
      .find({ _id: { $in: projectIds } }) // Use $in operator
      .sort({ updatedAt: -1 })
      .toArray();

    return projects;
  } catch (error) {
    console.error(
      "getProjectsForCurrentUser: Database error fetching projects.",
      error
    );
    return [];
  }
}

// Add functions for creating projects, adding members, etc. as Server Actions later
// e.g., createProject(name: string, description?: string): Promise<Project | null>
// e.g., addMemberToProject(projectId: string, userEmail: string): Promise<boolean>
