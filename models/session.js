const mongoose = require("mongoose");

const Schema = mongoose.Schema; //Schema là cấu trúc cho phép định nghĩa kiểu dữ liệu và các ràng buộc cho tài liệu (documents)

const sessionSchema = new Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);
module.exports = mongoose.model("Session", sessionSchema); //xuất mô hình ra để có thể sử dụng ở các tệp khác trong dự án
