// lib/data/tasks.ts
import clientPromise from "@/lib/db";
import { ObjectId } from "mongodb";
import { Task, TaskStatus } from "@/lib/data/types"; // Assuming Task type is here

/**
 * Fetches active tasks assigned to a specific user within a specific project.
 * Active means not DONE or CANCELED.
 *
 * @param projectId The ID of the project.
 * @param userId The ID of the user.
 * @returns Promise<Pick<Task, '_id' | 'title'>[]> - Array of partial task objects (ID and title).
 */
export async function getActiveAssignedTasksForUser(
  projectId: string | ObjectId,
  userId: string | ObjectId
): Promise<Pick<Task, "_id" | "title">[]> {
  try {
    const client = await clientPromise;
    const db = client.db(); // Use your DB name logic if needed
    const tasksCollection = db.collection<Task>("tasks");

    const projIdObject = new ObjectId(projectId);
    const userIdObject = new ObjectId(userId);

    const activeTasks = await tasksCollection
      .find(
        {
          projectId: projIdObject,
          assigneeIds: userIdObject,
          status: {
            $nin: [TaskStatus.DONE, TaskStatus.CANCELED],
          },
        },
        {
          projection: {
            _id: 1,
            title: 1,
          },
        }
      )
      .limit(10) // Limit to 10 tasks for performance
      .toArray();

    return activeTasks.map((task) => ({
      _id: task._id,
      title: task.title,
    }));
  } catch (error) {
    console.error("Error fetching active tasks for user:", error);
    return [];
  }
}
