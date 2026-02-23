import { redirect } from "next/navigation";

export default function MyStreamsPage() {
  redirect("/profile?tab=streams");
}
