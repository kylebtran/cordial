// server/actions/auth.ts
"use server";

import { signIn } from "@/auth";
import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import clientPromise from "@/lib/db";
import bcrypt from "bcrypt";
import { MongoClient } from "mongodb";

export interface SignupFormData {
  name: string;
  email: string;
  password: string;
}

export async function handleLogin(prevState: unknown, formData: FormData) {
  try {
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;

    if (!email || !password) {
      return { error: "Email and password are required." };
    }

    console.log("Attempting sign in with credentials...");
    await signIn("credentials", {
      email,
      password,
      redirectTo: "/dashboard",
    });
  } catch (error) {
    console.error("Login action error caught:", error);

    if (error instanceof AuthError) {
      return { error: "An unexpected authentication error occurred." };
    }

    if (error instanceof Error && error.message.includes("NEXT_REDIRECT")) {
      console.log("Caught NEXT_REDIRECT, re-throwing for framework handling.");
      throw error;
    }

    console.error("Caught unexpected non-AuthError during login:", error);
    return { error: "An unknown error occurred during login." };
  }
}

export async function handleSignup(prevState: unknown, formData: FormData) {
  let client: MongoClient | undefined;
  try {
    const name = formData.get("name") as string;
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;

    if (!name || !email || !password) {
      return { error: "All fields are required." };
    }
    if (password.length < 6) {
      return { error: "Password must be at least 6 characters long." };
    }

    console.log("Attempting signup for email:", email);

    client = await clientPromise;
    const db = client.db();
    const usersCollection = db.collection("users");

    const existingUser = await usersCollection.findOne({ email: email });
    if (existingUser) {
      console.log("Signup failed: Email already exists.");
      return { error: "An account with this email already exists." };
    }

    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);
    console.log("Password hashed successfully.");

    const result = await usersCollection.insertOne({
      name: name,
      email: email,
      password: hashedPassword,
      emailVerified: null,
      image: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    if (!result.insertedId) {
      console.error("Signup failed: User insertion failed.");
      return { error: "Could not create account. Please try again." };
    }

    console.log("Signup successful for:", email, "ID:", result.insertedId);
  } catch (error) {
    console.error("Signup action error:", error);
    if (
      error instanceof Error &&
      error.message.includes("duplicate key error") &&
      error.message.includes("email")
    ) {
      return { error: "An account with this email already exists." };
    }
    return { error: "An unexpected error occurred during signup." };
  }
  redirect("/login?status=signup_success");
}
