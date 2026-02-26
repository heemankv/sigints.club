import StreamPageShell from "./StreamPageShell";

export default function StreamPage({ params }: { params: { id: string } }) {
  return <StreamPageShell streamId={params.id} />;
}
