const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const dayjs = require("dayjs");

module.exports = function (prisma) {
  const router = express.Router();

  router.get("/login", (req, res) => {
    res.render("login", { error: null });
  });

  router.post("/login", async (req, res) => {
    const { username, password } = req.body;
    const user = await prisma.user.findUnique({ where: { username } });
    if (!user) return res.render("login", { error: "用户名或密码错误" });

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.render("login", { error: "用户名或密码错误" });

    const token = jwt.sign(
      { id: user.id, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.cookie("token", token, { httpOnly: true });

    const today = dayjs().format("YYYY-MM-DD");
    try {
      await prisma.loginLog.create({
        data: { userId: user.id, loginDate: today }
      });
    } catch (e) {}

    res.redirect("/tree");
  });

  router.get("/register", (req, res) => {
    res.render("register", { error: null });
  });

router.post("/register", async (req, res) => {
    const { username, password, confirmPassword } = req.body;

    if (!username || !password) {
      return res.render("register", { error: "用户名和密码不能为空" });
    }
    if (password.length < 6) {
      return res.render("register", { error: "密码至少需要6位" });
    }
    if (password !== confirmPassword) {
      return res.render("register", { error: "两次密码输入不一致" });
    }

    try {
      const exists = await prisma.user.findUnique({ where: { username } });
      if (exists) {
        return res.render("register", { error: "用户名已存在，换一个吧～" });
      }

      const passwordHash = await bcrypt.hash(password, 10);

      // 只存必填字段 username 和 passwordHash
      await prisma.user.create({
        data: {
          username,
          passwordHash
        }
      });

      res.redirect("/login?registered=1");
    } catch (err) {
      console.error("注册失败:", err);
      res.render("register", { error: "注册失败，请稍后再试" });
    }
});

  router.get("/logout", (req, res) => {
    res.clearCookie("token");
    res.redirect("/login");
  });

  return router;
};
DATABASE_URL="file:./dev.db"