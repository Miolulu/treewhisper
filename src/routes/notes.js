const express = require("express");
const multer = require("multer");
const path = require("path");
const dayjs = require("dayjs");
const { requireAuth } = require("../middleware/auth");
const { containsBannedWords, detectSensitiveMood } = require("../middleware/safety");
const { renderContent } = require("../utils/content");
const { calcLevel, generateWelcomeByNotes } = require("../utils/spirit");

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(__dirname, "../../public/uploads"));
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + "-" + file.originalname.replace(/\s+/g, "_"));
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }
});

module.exports = function (prisma) {
  const router = express.Router();

  // 写纸条页面（现在重定向到树历并自动打开弹窗）
  router.get("/new", requireAuth, (req, res) => {
    res.redirect("/tree?write=1");
  });

  // 创建纸条
  router.post("/new", requireAuth, upload.array("images", 3), async (req, res) => {
    const { title, content, contentType, category, action } = req.body;

    if (!content || content.trim() === "") {
      const errorMsg = "纸条内容不能为空哦～";
      if (req.xhr || req.headers.accept.indexOf('json') > -1) {
        return res.status(400).send(errorMsg);
      }
      return res.render("new-note", { error: errorMsg });
    }

    if (containsBannedWords((title || "") + " " + content)) {
      const errorMsg = "内容中含有不适宜词汇，请修改后再保存";
      if (req.xhr || req.headers.accept.indexOf('json') > -1) {
        return res.status(400).send(errorMsg);
      }
      return res.render("new-note", { error: errorMsg });
    }

    const isSensitive = detectSensitiveMood(content);

    // 如果是抛出纸团，检查今日抛掷次数
    if (action === "throw") {
      const today = dayjs().startOf("day").toDate();
      const tomorrow = dayjs().add(1, "day").startOf("day").toDate();
      const thrownToday = await prisma.note.count({
        where: {
          userId: req.user.id,
          status: "thrown",
          thrownAt: { gte: today, lt: tomorrow }
        }
      });
      if (thrownToday >= 1) {
        const errorMsg = "你今天已经抛出过一个纸团啦，明天再来吧～";
        if (req.xhr || req.headers.accept.indexOf('json') > -1) {
          return res.status(400).send(errorMsg);
        }
        return res.render("new-note", { error: errorMsg });
      }
    }

    const note = await prisma.note.create({
      data: {
        userId: req.user.id,
        title: title || "",
        content: content.trim(),
        contentType: contentType || "plain",
        category: category || "mood",
        allowReply: true,
        isSensitive,
        status: action === "throw" ? "thrown" : "private",
        thrownAt: action === "throw" ? new Date() : null
      }
    });

    if (req.files && req.files.length) {
      for (const file of req.files) {
        await prisma.noteImage.create({
          data: {
            noteId: note.id,
            imageUrl: "/public/uploads/" + file.filename
          }
        });
      }
    }

    // ========== 增加精灵经验并更新等级 ==========
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    const newExp = (user.spiritExp || 0) + 1;          // 写纸条经验 +1
    const newLevel = calcLevel(newExp);                 // 重新计算等级
    await prisma.user.update({
      where: { id: req.user.id },
      data: {
        spiritExp: newExp,
        spiritLevel: newLevel
      }
    });

    // 更新欢迎语
    const latestNotes = await prisma.note.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: "desc" },
      take: 5
    });
    await prisma.user.update({
      where: { id: req.user.id },
      data: {
        welcomeMessage: generateWelcomeByNotes(latestNotes, user.spiritType)
      }
    });

    // 响应
    if (req.xhr || req.headers.accept.indexOf('json') > -1) {
      return res.send("ok");
    }
// 如果是 AJAX 请求，返回纯文本
if (req.xhr || (req.headers.accept && req.headers.accept.indexOf('json') > -1)) {
  return res.send("ok");
}
    res.redirect("/notes");
  });

  // 纸条列表
router.get("/", requireAuth, async (req, res) => {
    const category = req.query.category;
    const date = req.query.date;

    const where = { userId: req.user.id };
    if (category) where.category = category;

    // 仅在 date 为有效 YYYY-MM-DD 格式时才添加日期筛选
    if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
        try {
            const localDate = new Date(date + 'T00:00:00');
            if (isNaN(localDate.getTime())) throw new Error('Invalid');
            const offset = localDate.getTimezoneOffset() * 60000;
            const startUtc = new Date(localDate.getTime() - offset);
            const endUtc = new Date(startUtc.getTime() + 86400000 - 1);
            if (!isNaN(startUtc.getTime()) && !isNaN(endUtc.getTime())) {
                where.createdAt = { gte: startUtc, lte: endUtc };
            }
        } catch(e) {
            console.error('日期解析错误，已跳过筛选', e);
        }
    }

    const notes = await prisma.note.findMany({
        where,
        include: { images: true, replies: true },
        orderBy: { createdAt: "desc" }
    });

    const parsed = notes.map(n => ({
        ...n,
        rendered: renderContent(n.content, n.contentType)
    }));

    res.render("note-list", {
        notes: parsed,
        category: category || "",
        embed: req.query.embed === '1'
    });
});

  // 纸条详情
  router.get("/:id", requireAuth, async (req, res) => {
    const note = await prisma.note.findUnique({
      where: { id: Number(req.params.id) },
      include: { images: true, replies: true }
    });
    if (!note) return res.redirect("/notes");

    // 如果是 JSON 请求
    if (req.query.format === 'json') {
      return res.json({
        id: note.id,
        category: note.category,
        content: note.content,
        userId: note.userId,
        rendered: renderContent(note.content, note.contentType),
        createdAt: note.createdAt,
        replies: note.replies
      });
    }

    res.render("note-detail", { note, error: null, currentPage: "notes" });
});

  // 单独抛出纸条
  router.post("/:id/throw", requireAuth, async (req, res) => {
    const noteId = Number(req.params.id);
    const note = await prisma.note.findFirst({
      where: { id: noteId, userId: req.user.id }
    });
    if (!note) return res.send("纸条不存在");

    if (note.isSensitive) {
      return res.send("该纸条内容不适合进入公共池。");
    }
    if (containsBannedWords(note.title + " " + note.content)) {
      return res.send("含有不适宜内容，不能抛出。");
    }

    const today = dayjs().startOf("day").toDate();
    const tomorrow = dayjs().add(1, "day").startOf("day").toDate();
    const thrownToday = await prisma.note.count({
      where: {
        userId: req.user.id,
        status: "thrown",
        thrownAt: { gte: today, lt: tomorrow }
      }
    });
    if (thrownToday >= 1) return res.send("今天已抛出过一个纸团，明天再试试吧。");

    await prisma.note.update({
      where: { id: noteId },
      data: { status: "thrown", thrownAt: new Date() }
    });
   // 如果是 AJAX 请求，返回纯文本
if (req.xhr || req.headers.accept.indexOf('json') > -1) {
  return res.send("ok");
}
res.redirect("/notes");
  });

// ========== 通知相关路由 ==========

// 获取所有回复（包括已读和未读）
router.get("/replies/all", requireAuth, async (req, res) => {
    const replies = await prisma.reply.findMany({
        where: {
            note: { userId: req.user.id },
            fromUserId: { not: req.user.id }
        },
        include: {
            fromUser: { select: { username: true } },
            note: { select: { id: true, content: true } }   // 增加 content
        },
        orderBy: { createdAt: "desc" },
        take: 50
    });
    const result = replies.map(r => ({
        id: r.id,
        content: r.content,
        noteId: r.note.id,
        noteContent: r.note.content.substring(0, 50),   // 原纸条内容摘要
        fromUser: { username: r.fromUser?.username || "匿名" },
        createdAt: r.createdAt,
        isRead: r.isRead
    }));
    res.json(result);
});

// 标记单条回复为已读
router.post("/replies/mark-read/:id", requireAuth, async (req, res) => {
    await prisma.reply.updateMany({
        where: { id: Number(req.params.id), note: { userId: req.user.id } },
        data: { isRead: true }
    });
    res.json({ success: true });
});

// 全部标记已读
router.post("/replies/mark-all-read", requireAuth, async (req, res) => {
    await prisma.reply.updateMany({
        where: { note: { userId: req.user.id }, isRead: false },
        data: { isRead: true }
    });
    res.json({ success: true });
});

// 获取未读回复数量（如果已有则忽略）
router.get("/replies/unread-count", requireAuth, async (req, res) => {
    const count = await prisma.reply.count({
        where: {
            note: { userId: req.user.id },
            fromUserId: { not: req.user.id },
            isRead: false
        }
    });
    res.json({ count });
});
  return router;
};