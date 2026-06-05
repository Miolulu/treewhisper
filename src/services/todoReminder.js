const schedule = require("node-schedule");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

let io = null;
const setIO = (socketio) => { io = socketio; };

const startTodoReminder = () => {
  schedule.scheduleJob("* * * * *", async () => {
    const now = new Date();
    const todos = await prisma.todo.findMany({
      where: {
        remindAt: { lte: now },
        isCompleted: false,
        isNotified: false
      },
      include: { user: true }
    });
    for (const todo of todos) {
      if (io) {
        io.to("user:" + todo.userId).emit("notification", {
          type: "TODO_REMINDER",
          title: "⏰ 待办提醒",
          message: todo.title,
          todoId: todo.id,
          timestamp: new Date()
        });
      }
      await prisma.todo.update({
        where: { id: todo.id },
        data: { isNotified: true }
      });
    }
  });
};

module.exports = { startTodoReminder, setIO };