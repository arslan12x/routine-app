"use client";
import { createAuthClient } from "better-auth/react";
import { usernameClient } from "better-auth/client/plugins";
import { ssoClient } from "@better-auth/sso/client";
export const authClient = createAuthClient({ plugins: [usernameClient({ displayUsername: false }), ssoClient()] });
