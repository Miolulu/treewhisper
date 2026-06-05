const express = require("express");
const path = require("path");
const cookieParser = require("cookie-parser");
const dotenv = require("dotenv");
const rateLimit = require("express-rate-limit");
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  message: "请求过于频繁，请稍后再试。"
});
const { PrismaClient } = require("@prisma/client");
const { attachUser } = require("./middleware/auth");

dotenv.config();
const app = express();
const http = require("http");
const socketIo = require("socket.io");

const server = http.createServer(app);
const io = socketIo(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

const onlineUsers = new Map();
const sendRealtimeNotification = (userId, data) => {
  if (userId && onlineUsers.has(userId.toString())) {
    io.to("user:" + userId).emit("notification", {
      ...data, timestamp: new Date(), read: false
    });
  }
};
app.set('sendRealtimeNotification', sendRealtimeNotification);

io.on("connection", (socket) => {
  console.log("WebSocket connected:", socket.id);
  socket.on("authenticate", (userId) => {
    if (userId) {
      socket.join("user:" + userId);
      onlineUsers.set(userId.toString(), socket.id);
    }
  });
  socket.on("disconnect", () => {
    for (let [uid, sid] of onlineUsers.entries()) {
      if (sid === socket.id) { onlineUsers.delete(uid); break; }
    }
  });
});

const prisma = new PrismaClient();

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "../views"));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());
app.use("/public", express.static(path.join(__dirname, "../public")));

app.use(attachUser);
app.use("/", require("./routes/auth")(prisma));
app.use("/notes", require("./routes/notes")(prisma));
app.use("/spirit", require("./routes/spirit")(prisma));
app.use("/user", require("./routes/user")(prisma));
app.use("/bottles", require("./routes/bottles")(prisma, io));
app.use("/todos", require("./routes/todos")(prisma));

app.get("/", (req, res) => {
  if (!req.user) return res.redirect("/login");
  res.redirect("/tree");
});

// 树历首页
app.get("/tree", async (req, res) => {
  if (!req.user) return res.redirect("/login");
  const user = await prisma.user.findUnique({
    where: { id: req.user.id }
  });
  res.render("tree-home", { currentPage: "tree", user: user });
});

// 写纸条页
app.get("/notes/new", (req, res) => {
  if (!req.user) return res.redirect("/login");
  res.render("new-note", { currentPage: "write" });
});

// 精灵页面
app.get("/spirit", (req, res) => {
  if (!req.user) return res.redirect("/login");
  res.render("spirit", { currentPage: "spirit", error: null, user: req.user });
});

// 树影集页面
app.get("/album", (req, res) => {
  if (!req.user) return res.redirect("/login");
  const images = [];
  res.render("album", { currentPage: "album", images: images, error: null });
});

// 设置页面
app.get("/settings", (req, res) => {
  if (!req.user) return res.redirect("/login");
  res.render("settings", { currentPage: "settings", user: req.user });
});

// 修改昵称
app.post("/settings/nickname", async (req, res) => {
  if (!req.user) return res.redirect("/login");
  const { nickname } = req.body;
  if (nickname) {
    await prisma.user.update({
      where: { id: req.user.id },
      data: { nickname }
    });
  }
  res.redirect("/settings");
});

// 更换精灵（重置成长值）
app.post("/settings/spirit", async (req, res) => {
  if (!req.user) return res.redirect("/login");
  const { spiritType } = req.body;
  const validTypes = ["snail", "squirrel", "bird", "butterfly"];
  if (validTypes.includes(spiritType)) {
    await prisma.user.update({
      where: { id: req.user.id },
      data: {
        spiritType,
        spiritExp: 0,
        spiritLevel: 1
      }
    });
  }
  res.redirect("/settings");
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log('Server: http://localhost:' + PORT);
  console.log("WebSocket started");
});
