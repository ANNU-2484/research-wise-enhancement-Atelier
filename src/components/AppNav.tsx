import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { BookOpenText, Loader2, User } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PasswordRequirements, validatePassword } from "@/components/PasswordRequirements";

export function AppNav() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [updatingPassword, setUpdatingPassword] = useState(false);

  const handleSignOut = async () => {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validatePassword(newPassword).isValid) {
      toast.error("Password does not meet all required rules.");
      return;
    }
    if (newPassword !== confirmNewPassword) {
      toast.error("Passwords do not match.");
      return;
    }
    setUpdatingPassword(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setUpdatingPassword(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Password successfully updated.");
    setNewPassword("");
    setConfirmNewPassword("");
    setChangePasswordOpen(false);
  };

  return (
    <>
      <header className="border-b border-border bg-card/60 backdrop-blur supports-[backdrop-filter]:bg-card/40">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link to="/dashboard" className="flex items-center gap-2.5 group">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-ink text-primary-foreground shadow-paper">
              <BookOpenText className="h-4 w-4" />
            </div>
            <div className="leading-tight">
              <div className="font-serif text-base font-semibold tracking-tight text-foreground">Atelier</div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Research Framework</div>
            </div>
          </Link>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-2">
                <User className="h-4 w-4" />
                Account
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onClick={() => setChangePasswordOpen(true)} className="cursor-pointer">
                Change Password
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleSignOut} className="cursor-pointer">
                Log Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <Dialog open={changePasswordOpen} onOpenChange={setChangePasswordOpen}>
        <DialogContent className="sm:max-w-md bg-paper shadow-paper">
          <DialogHeader>
            <div className="flex flex-col items-center mb-1">
              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-ink text-primary-foreground shadow-paper mb-2">
                <User className="h-5 w-5" />
              </div>
              <DialogTitle className="font-serif text-2xl font-semibold tracking-tight text-foreground">
                Atelier
              </DialogTitle>
              <DialogDescription className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground mt-0.5">
                RESEARCH FRAMEWORK
              </DialogDescription>
            </div>
          </DialogHeader>

          <form onSubmit={handleChangePassword} className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label htmlFor="new-password">New Password</Label>
              <Input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
              />
              <PasswordRequirements password={newPassword} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="confirm-new-password">Confirm New Password</Label>
              <Input
                id="confirm-new-password"
                type="password"
                value={confirmNewPassword}
                onChange={(e) => setConfirmNewPassword(e.target.value)}
                autoComplete="new-password"
              />
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="ghost" onClick={() => setChangePasswordOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={updatingPassword}>
                {updatingPassword ? <Loader2 className="h-4 w-4 animate-spin" /> : "Change Password"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}


