const express = require("express");
const { requireAuth } = require("../middleware/auth");

module.exports = function (prisma) {
  const router = express.Router();

  // 更新用户名
  router.post("/update", requireAuth, async (req, res) => {
    const { username } = req.body;
    if (!username || username.trim() === "") {
      return res.status(400).send("用户名不能为空");
    }
    
    // 检查用户名是否已被占用
    const existing = await prisma.user.findUnique({ where: { username } });
    if (existing && existing.id !== req.user.id) {
      return res.status(400).send("用户名已被使用");
    }

    await prisma.user.update({
      where: { id: req.user.id },
      data: { username: username.trim() }
    });
    res.send("ok");
  });

  return router;
};