import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";

function admins() {
    return new Set(
        (process.env.ADMIN_TWITCH_USER_IDS ?? "")
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
    );
}

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
    const session = await auth();
    const id = session?.user?.id as string | undefined;

    if (!id || !admins().has(id)) redirect("/");

    return <>{children}</>;
}
