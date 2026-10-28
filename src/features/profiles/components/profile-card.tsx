import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui";
import type { Profile } from "../types";

export function ProfileCard({ profile, email }: { profile: Profile; email: string | null }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{profile.fullName ?? "Unnamed user"}</CardTitle>
        <CardDescription>{email}</CardDescription>
      </CardHeader>
      <CardContent className="text-muted-foreground text-sm">
        Member since {new Date(profile.createdAt).toLocaleDateString()}
      </CardContent>
    </Card>
  );
}
