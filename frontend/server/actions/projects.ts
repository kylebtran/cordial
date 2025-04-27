// server/actions/projects.ts
"use server";

import { auth } from "@/auth";
import { Project, Membership, Role } from "@/lib/data/types"; // Added Membership and Role
import clientPromise from "@/lib/db";
import { ObjectId } from "mongodb";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function createNewProjectAction({
  name,
  github,
}: {
  name: string;
  github: string;
}): Promise<{ error?: string; success?: boolean; projectId?: string }> {
  // Add projectId to success return type
  const session = await auth();
  if (!session?.user?.id) {
    return { error: "Authentication required." };
  }
  const userId = session.user.id;

  // Validate project name (basic example)
  if (!name || name.trim().length === 0) {
    return { error: "Project name cannot be empty." };
  }
  if (name.length > 100) {
    // Example limit
    return { error: "Project name is too long (max 100 characters)." };
  }

  let userIdObject: ObjectId;
  try {
    // Correct assignment
    userIdObject = new ObjectId(userId);
  } catch (e) {
    console.error("Invalid user ID format in createNewProjectAction", e);
    // Don't expose internal errors directly, but signal failure
    return { error: "An internal error occurred. Invalid user identifier." };
  }

  let newProjectId: ObjectId | null = null;
  let client; // Declare client outside try for potential finally block if needed

  try {
    client = await clientPromise;
    const db = client.db(); // Use your specific DB name if needed

    // --- 1. Create the Project ---
    const projectsCollection = db.collection<Project>("projects");
    const newProjectData: Omit<Project, "_id"> = {
      name: name.trim(), // Trim whitespace
      description: null, // Default description
      github: github.trim(), // Trim whitespace
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const projectInsertResult = await projectsCollection.insertOne(
      newProjectData as Project
    );

    if (!projectInsertResult.insertedId) {
      throw new Error("Project insertion failed to return an ID.");
    }
    newProjectId = projectInsertResult.insertedId;
    console.log(`New project created: ${newProjectId} by user ${userId}`);

    // --- 2. Create Admin Membership ---
    // -- 3 [DEMO ONLY]. Add Demo Memberships ---
    const DEMO_MEMBERS = [
      {
        userId: "680d4d4b0b98389574588b00",
        name: "Lucas",
        role: Role.DESIGNER,
      },
      {
        userId: "680e120cc4c505eb35616c34",
        name: "Aditya",
        role: Role.DEVELOPER,
      },
      {
        userId: "680e1224c4c505eb35616c35",
        name: "Vishok",
        role: Role.DEVOPS,
      },
      // Kyle (680e1249c4c505eb35616c36) is the creator, assigned ADMIN role below
    ];

    const membershipsCollection = db.collection<Membership>("memberships");
    const membershipsToInsert: Omit<Membership, "_id">[] = [
      {
        projectId: newProjectId,
        userId: userIdObject,
        role: Role.ADMIN,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      ...DEMO_MEMBERS.map((member) => {
        try {
          // Important: Validate demo user IDs before creating ObjectId
          if (!ObjectId.isValid(member.userId)) {
            console.warn(
              `Skipping demo member ${member.name}: Invalid ObjectId format '${member.userId}'`
            );
            return null; // Skip this member
          }
          return {
            projectId: newProjectId!, // Use non-null assertion as projectId must exist here
            userId: new ObjectId(member.userId),
            role: member.role,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
        } catch (idError) {
          console.error(
            `Error creating ObjectId for demo user ${member.name} (${member.userId}):`,
            idError
          );
          return null; // Skip on error
        }
      }).filter((m): m is Omit<Membership, "_id"> => m !== null), // Filter out nulls from map
    ];

    if (membershipsToInsert.length > 0) {
      console.log(
        `Attempting to insert ${membershipsToInsert.length} memberships...`
      );
      const membershipInsertResult = await membershipsCollection.insertMany(
        membershipsToInsert as Membership[] // Insert all prepared memberships
      );

      if (membershipInsertResult.insertedCount !== membershipsToInsert.length) {
        // This indicates some memberships failed to insert, which shouldn't happen
        // unless there's a unique index conflict or major DB issue.
        // We already created the project, so this is problematic.
        console.error(
          `CRITICAL: Project ${newProjectId} created, but failed to insert all memberships. Expected ${membershipsToInsert.length}, Inserted: ${membershipInsertResult.insertedCount}`
        );
        // For simplicity, we'll throw, but real-world might need cleanup/retry.
        throw new Error(
          "Failed to create all required memberships for the new project."
        );
      }
      console.log(
        `Successfully created ${membershipInsertResult.insertedCount} memberships for project ${newProjectId}`
      );
    } else {
      console.warn(
        `No valid memberships generated to insert for project ${newProjectId}`
      );
      // This might happen if creator ID was invalid AND all demo IDs were invalid
      // Throw an error because at least the creator should be added.
      throw new Error("Failed to prepare any valid memberships for insertion.");
    }

    // --- 3. Revalidate Paths ---
    // Revalidate the path for the project layout/overview
    revalidatePath(`/project/${newProjectId.toString()}`, "layout");
    // Optional: Revalidate a general dashboard/project list page if one exists
    // revalidatePath('/dashboard');
  } catch (error) {
    console.error("Error creating new project or membership:", error);
    // Corrected error message
    return { error: "Could not create the new project. Please try again." };
  }
  // No finally block needed unless managing client connection manually

  // --- 4. Redirect on Success ---
  // Should always have newProjectId if try block succeeded without throwing
  redirect(`/project/${newProjectId.toString()}/overview`);

  // Note: The lines below the redirect will technically not be reached,
  // but returning a success object might be useful if not redirecting (e.g., for API use).
  // The redirect function throws a NEXT_REDIRECT error, stopping execution.
  // return { success: true, projectId: newProjectId.toString() };
}

export interface UserProjectInfo {
  _id: ObjectId; // Project ID
  name: string; // Project Name
}

/**
 * Fetches a list of projects the given user is a member of.
 *
 * @param userId The ID of the user.
 * @returns Promise<UserProjectInfo[]> An array of project IDs and names.
 */
export async function getProjectsForUser(
  userId: string | ObjectId
): Promise<UserProjectInfo[]> {
  try {
    const client = await clientPromise;
    const db = client.db(); // Use your DB name if needed

    const userIdObject = new ObjectId(userId);

    const membershipsCollection = db.collection<Membership>("memberships");
    const projectsCollection = db.collection<Project>("projects");

    // 1. Find all memberships for the user
    const userMemberships = await membershipsCollection
      .find(
        { userId: userIdObject },
        { projection: { projectId: 1 } } // Only need the projectId
      )
      .toArray();

    // 2. Extract the project IDs
    const projectIds = userMemberships.map((m) => m.projectId);

    if (projectIds.length === 0) {
      return []; // User is not a member of any projects
    }

    // 3. Find the actual project documents for those IDs
    const userProjects = await projectsCollection
      .find(
        { _id: { $in: projectIds } }, // Find projects whose IDs are in the list
        { projection: { _id: 1, name: 1 } } // Only need ID and name for the dropdown
      )
      .sort({ name: 1 }) // Optional: Sort alphabetically
      .toArray();

    console.log(`Found ${userProjects.length} projects for user ${userId}`);
    // Map to ensure correct type structure if needed, though find should return matching fields
    return userProjects.map((p) => ({ _id: p._id, name: p.name }));
  } catch (error) {
    console.error(`Error fetching projects for user ${userId}:`, error);
    return []; // Return empty array on error
  }
}
