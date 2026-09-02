"use client";

import { useAuth } from "@/lib/auth/auth-context";
import { Card, CardContent } from "@/components/ui/Card";
import { Label } from "@/components/ui/Label";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

export default function SettingsPage() {
  const { creator, signOut } = useAuth();

  return (
    <div className="max-w-lg space-y-6">
      <h2 className="text-xl font-semibold text-foreground">Profile</h2>

      <Card>
        <CardContent className="space-y-4 p-6">
          <div className="space-y-1.5">
            <Label htmlFor="settings-name">Name</Label>
            <Input id="settings-name" value={creator?.name ?? ""} readOnly />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="settings-email">Email</Label>
            <Input id="settings-email" value={creator?.email ?? ""} readOnly />
          </div>
        </CardContent>
      </Card>

      <Button variant="destructive" onClick={() => void signOut()}>
        Sign out
      </Button>
    </div>
  );
}
