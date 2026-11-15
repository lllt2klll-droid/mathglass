import Link from "next/link";
import { Compass } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-[70dvh] items-center justify-center p-6">
      <div className="max-w-md text-center">
        <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-[color:var(--mg-highlight)] text-primary">
          <Compass className="size-6" />
        </span>
        <h1 className="mt-4 text-2xl font-bold tracking-tight">404 — Không tìm thấy trang</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Đường dẫn này không tồn tại hoặc dự án đã bị xóa. Hãy quay lại Dashboard hoặc mở
          LaTeX Studio từ một dự án cụ thể.
        </p>
        <div className="mt-5 flex justify-center gap-2">
          <Button asChild>
            <Link href="/dashboard">Về Dashboard</Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href="/library">Thư viện</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
