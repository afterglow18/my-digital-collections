import { Router } from "express";
import path from "path";

const router = Router();

router.get("/download/app-preview", (_req, res) => {
  const file = path.resolve("AppPreview_final.mp4");
  res.setHeader("Content-Disposition", 'attachment; filename="AppPreview_final.mp4"');
  res.setHeader("Content-Type", "video/mp4");
  res.sendFile(file);
});

export default router;
