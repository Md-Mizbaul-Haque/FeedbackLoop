import Image from "next/image";

export function LogoMark({
  className = "h-8 w-auto",
}: {
  className?: string;
}) {
  return (
    <Image
      src="/logo.png"
      alt="FeedbackLoop logo"
      width={1536}
      height={1024}
      className={className}
    />
  );
}