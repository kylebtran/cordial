// lib/data/memberships.ts
import clientPromise from "@/lib/db";
import { ObjectId } from "mongodb";
import { Membership, Role } from "@/lib/data/types";

export async function getUserRoleInProject(
  projectId: string | ObjectId,
  userId: string | ObjectId
): Promise<Role | null> {
  try {
    const client = await clientPromise;
    const db = client.db();
    const membershipCollection = db.collection<Membership>("memberships");

    const projIdObject = new ObjectId(projectId);
    const userIdObject = new ObjectId(userId);

    const membership = await membershipCollection.findOne({
      projectId: projIdObject,
      userId: userIdObject,
    });

    return membership?.role ?? null;
  } catch (error) {
    console.error("Error fetching user role:", error);
    return null;
  }
}
