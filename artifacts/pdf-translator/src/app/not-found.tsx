import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-gray-50 dark:bg-background">
      <Card className="mx-4 w-full max-w-md">
        <CardContent className="pt-6">
          <div className="mb-4 flex gap-2">
            <AlertCircle className="h-8 w-8 text-red-500" />
            <h1 className="text-2xl font-bold text-gray-900 dark:text-foreground">404 — Página no encontrada</h1>
          </div>
          <p className="mt-4 text-sm text-gray-600 dark:text-muted-foreground">
            La ruta solicitada no existe.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
