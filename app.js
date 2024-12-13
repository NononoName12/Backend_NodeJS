const express = require("express");
const bodyParser = require("body-parser");
const path = require("path");
const mongoose = require("mongoose");
const session = require("express-session");
const MongoDBStore = require("connect-mongodb-session")(session);
// const csrf = require("csurf");
const User = require("./models/user");
// const flash = require("connect-flash");
// const multer = require("multer");
const cors = require("cors");
const homeRoutes = require("./routes/home");
const authRoutes = require("./routes/auth");
const adminRoutes = require("./routes/admin");
const chatRoutes = require("./routes/chat");
// const Product = require("../Server/models/product");
const http = require("http");
const socketIo = require("socket.io");
const ChatRoom = require("./models/chatRoom");

const MONGODB_URI = process.env.MONGODB_URI;
const app = express();

// Tạo một server HTTP và kết nối với ứng dụng Express (app)
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: [
      "https://assignment3-node-js.vercel.app",
      "https://nonononame12.github.io",
    ], // Client and Admin origins
    methods: ["GET", "POST"],
    credentials: true, // Nếu cần xác thực
  },
});

// Lưu danh sách các phòng chat đang hoạt động
let activeRooms = [];

//Hàm để load các phòng chat từ MongoDB khi server khởi động
const loadActiveRooms = async () => {
  try {
    const rooms = await ChatRoom.find({});
    activeRooms = rooms;
    console.log("Loaded active rooms from MongoDB:", activeRooms);
  } catch (error) {
    console.error("Error loading active rooms from MongoDB:", error);
  }
};
loadActiveRooms();

// Xử lý sự kiện kết nối giữa client và server
io.on("connection", (socket) => {
  console.log("New client connected", socket.id);

  // Khi client tham gia phòng
  socket.on("joinRoom", async ({ roomId, userId }) => {
    socket.join(roomId);
    console.log(`${userId} joined room ${roomId}`);

    // Tìm phòng chat hoặc tạo mới nếu chưa tồn tại
    let room = await ChatRoom.findOne({ roomId });
    if (!room) {
      // console.log("ADD CHATROOMMMMMMMMMMMMMMMMMMMMMMMMMMMM");
      room = new ChatRoom({ roomId, messages: [] });
      await room.save();
      activeRooms.push(room);
      io.emit("activeRooms", activeRooms);
    } else {
      console.log("Room already exists, no need to add.");
      // Gửi danh sách phòng hoạt động tới admin
      io.emit("activeRooms", activeRooms);
    }

    // Gửi các tin nhắn cũ của phòng cho client
    socket.emit("loadMessages", room.messages);
  });

  // Lắng nghe tin nhắn từ client
  socket.on("chatMessage", async ({ roomId, sender, message }) => {
    const room = await ChatRoom.findOne({ roomId });

    if (room) {
      const newMessage = { sender, message, timestamp: new Date() };

      // Lưu tin nhắn vào MongoDB
      room.messages.push(newMessage);
      await room.save();

      // Gửi tin nhắn mới đến tất cả các thành viên trong phòng
      io.to(roomId).emit("message", newMessage);
    }
  });

  // Khi kết thúc chat
  socket.on("endChat", async ({ roomId }) => {
    // console.log("REMOVE CHATROOMMMMMMMMMMMMMMMMMMMMMMMMMMMM");
    // Xóa phòng chat khỏi cơ sở dữ liệu
    await ChatRoom.findOneAndDelete({ roomId }); // Xóa phòng chat khỏi MongoDB

    // Loại bỏ phòng khỏi danh sách activeRooms
    activeRooms = activeRooms.filter((room) => room.roomId !== roomId); // Loại bỏ phòng khỏi danh sách
    io.emit("activeRooms", activeRooms); // Cập nhật danh sách phòng cho admin

    socket.leave(roomId);
    // Phát sự kiện "end" chỉ cho client hiện tại
    socket.emit("end", "Chat has been ended."); // Gửi chỉ cho client kết thúc

    io.emit("endMess");
  });

  // Khi ngắt kết nối
  socket.on("disconnect", () => {
    console.log("Client disconnected", socket.id);
  });
});

// Middleware để phân tích JSON
app.use(bodyParser.json());
// Middleware để phân tích URL-encoded data
app.use(bodyParser.urlencoded({ extended: true }));
// Middleware để phân tích body của request
app.use(express.json()); // Để xử lý application/json
app.use(express.urlencoded({ extended: true })); // Để xử lý application/x-www-form-urlencoded

const allowedOrigins = [
  "https://assignment3-node-js.vercel.app",
  "https://nonononame12.github.io", // URL frontend React
];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        // Nếu không có origin (khi request từ server-side) hoặc origin hợp lệ
        callback(null, true);
      } else {
        // Nếu origin không hợp lệ
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true, // Cho phép gửi cookie và auth
  })
);
// app.use(
//   cors({
//     origin: "https://nonononame12.github.io", // GitHub Pages domain
//     credentials: true, // Quan trọng: Cho phép gửi cookie
//   })
// );

//Kết nối và lưu trữ session vào MongoDB
const store = new MongoDBStore({
  uri: MONGODB_URI,
  collection: "sessions",
});

// Tạo thư mục uploads nếu chưa tồn tại
const fs = require("fs");
const dir = "./uploads";
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir);
}

// Middleware để phục vụ các file tĩnh
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Cấu hình express-session với connect-mongo
app.use(
  session({
    secret: "my_secret_key", //secret key
    resave: false, // Session sẽ không được lưu lại vào kho lưu trữ (ví dụ: MongoDB) nếu nội dung của nó không thay đổi.
    saveUninitialized: false, // Session sẽ không được lưu cho đến khi nó có sự thay đổi
    store: store, // Nơi lưu trữ session (ở đây là MongoDB)
    cookie: {
      maxAge: 60 * 60 * 1000, // Thời gian sống của cookie (1 giờ)
      secure: false, // Chỉ gửi cookie qua HTTP trong môi trường production
      httpOnly: true, // Đảm bảo cookie không thể truy cập từ JavaScript
      sameSite: "None", // Cho phép gửi cookie qua các miền khác nhau
    },
  })
);

//Middleware sử dụng để kiểm tra và khôi phục thông tin người dùng từ session
app.use((req, res, next) => {
  // Kiểm tra xem người dùng đã đăng nhập hay chưa
  if (!req.session.user) {
    console.log("Chua dang nhap");
    return next(); // Nếu chưa đăng nhập, tiếp tục đến middleware hoặc route tiếp theo
  }
  // Tìm kiếm người dùng trong cơ sở dữ liệu dựa trên ID lưu trong session
  User.findById(req.session.user._id)
    .then((user) => {
      req.user = user; // Gán đối tượng người dùng tìm thấy vào req.user
      console.log(req.user, "req.user");
      next(); // Tiếp tục đến middleware hoặc route tiếp theo
    })
    .catch((err) => console.log(err)); // Xử lý lỗi
});

// Cấu hình các route (đường dẫn) cho ứng dụng Express.js
app.use("/chat", chatRoutes);
app.use("/admin", adminRoutes);
app.use("/auth", authRoutes);
app.use("/", homeRoutes);

app.use((req, res, next) => {
  //Middleware xử lý lỗi không tìm thấy Router
  res.status(404).json({ message: "Route not found" });
});

//Kết nối đến cơ sở dữ liệu MongoDB bằng Mongoose
mongoose
  .connect(MONGODB_URI)
  .then((result) => {
    console.log("Connect");
    console.log("Connect");
    server.listen(5000);
  })
  .catch((err) => {
    console.log(err);
  });
