// auth.config.ts
import { MongoDBAdapter } from "@auth/mongodb-adapter";
import clientPromise from "@/lib/db";
import { User } from "@/lib/data/types";
import type { NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { MongoClient, ObjectId } from "mongodb";
import bcrypt from "bcrypt";

export const authConfig = {
  providers: [
    Credentials({
      async authorize(credentials, req) {
        // 1. Validate credentials input (basic)
        if (!credentials?.email || !credentials?.password) {
          console.log("Missing credentials");
          return null; // Indicates failure, Auth.js throws CredentialsSignin error by default
        }

        const { email, password } = credentials;

        let client: MongoClient | undefined;
        try {
          // 2. Connect to DB
          client = await clientPromise;
          const db = client.db();
          const usersCollection = db.collection<User>("users");

          // 3. Find user by email
          const user = await usersCollection.findOne({
            email: email as string,
          });

          if (!user) {
            console.log("No user found with email:", email);
            return null;
          }

          // 4. Check if user has a password set
          if (!user.password) {
            console.log("User found but has no password set");
            return null;
          }

          // 5. Compare submitted password with hashed password in DB
          const passwordsMatch = await bcrypt.compare(
            password as string,
            user.password
          );

          if (passwordsMatch) {
            console.log("Password match for user:", email);
            // 6. Return user object (WITHOUT password) if successful
            return {
              id: user._id.toString(),
              email: user.email,
              name: user.name,
            };
          } else {
            console.log("Password mismatch for user:", email);
            return null;
          }
        } catch (error) {
          console.error("Error during authorization:", error);
          return null;
        }
        // Note: The client connection is managed by the singleton pattern in lib/db.ts,
        // so we don't explicitly close it here.
      },
    }),
  ],

  adapter: MongoDBAdapter(clientPromise),
  session: {
    strategy: "jwt",
    // maxAge: 30 * 24 * 60 * 60,
    // updateAge: 24 * 60 * 60,
  },

  pages: {
    signIn: "/login",
    // error: '/auth/error',
  },

  callbacks: {
    async jwt({ token, user, account, profile, trigger }) {
      // 1. On initial sign in (user object is available)
      if (user) {
        token.id = user.id;
      }

      // 3. Return the updated token
      return token;
    },

    async session({ session, token }) {
      if (token?.id) {
        session.user.id = token.id as string;
      }
      return session;
    },
  },
  secret: process.env.AUTH_SECRET,
  trustHost: true,
} satisfies NextAuthConfig;
