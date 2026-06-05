const express = require("express");
const { requireAuth } = require("../middleware/auth");

module.exports = function (prisma) {
  const router = express.Router();

  router.get("/", requireAuth, async (req, res) => {
    const todos = await prisma.todo.findMany({
      where: { userId: req.user.id },
      orderBy: { remindAt: "asc" }
    });
    res.json({ todos });
  });

  router.post("/", requireAuth, async (req, res) => {
    const { title, description, remindAt } = req.body;
    if (!title || !remindAt) {
      return res.status(400).json({ error: "标题和提醒时间不能为空" });
    }
    const todo = await prisma.todo.create({
      data: { userId: req.user.id, title, description: description || "", remindAt: new Date(remindAt) }
    });
    res.json({ todo });
  });

  router.put("/:id", requireAuth, async (req, res) => {
    const todo = await prisma.todo.findFirst({ where: { id: Number(req.params.id), userId: req.user.id } });
    if (!todo) return res.status(404).json({ error: "待办不存在" });
    const updated = await prisma.todo.update({
      where: { id: todo.id },
      data: { isCompleted: req.body.isCompleted ?? todo.isCompleted }
    });
    res.json({ todo: updated });
  });

  router.delete("/:id", requireAuth, async (req, res) => {
    const todo = await prisma.todo.findFirst({ where: { id: Number(req.params.id), userId: req.user.id } });
    if (!todo) return res.status(404).json({ error: "待办不存在" });
    await prisma.todo.delete({ where: { id: todo.id } });
    res.json({ success: true });
  });

  return router;
};