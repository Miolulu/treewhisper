const express = require("express");
const dayjs = require("dayjs");
const { requireAuth } = require("../middleware/auth");
const { getSpiritMeta, generateWelcomeByNotes } = require("../utils/spirit");

module.exports = function (prisma) {
  const router = express.Router();

  router.get("/", requireAuth, async (req, res) => {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id }
    });

    const notes = await prisma.note.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: "desc" },
      take: 5
    });

    const allNotes = await prisma.note.findMany({
      where: { userId: req.user.id }
    });

    const today = dayjs().startOf("day").toDate();
    const tomorrow = dayjs().add(1, "day").startOf("day").toDate();

    const todayThrown = await prisma.note.count({
      where: {
        userId: req.user.id,
        status: "thrown",
        thrownAt: { gte: today, lt: tomorrow }
      }
    });

    const spiritMeta = getSpiritMeta(user.spiritType, user.spiritLevel);
    const welcome = generateWelcomeByNotes(notes, user.spiritType);

    const calendarMap = {};
    allNotes.forEach(n => {
      const d = dayjs(n.createdAt).format("YYYY-MM-DD");
      calendarMap[d] = (calendarMap[d] || 0) + 1;
    });

    res.render("dashboard", {
      user,
      notes,
      spiritMeta,
      welcome,
      todayThrown,
      calendarMap,
      now: dayjs().format("YYYY-MM-DD")
    });
  });

  return router;
};
