const mongoose = require("mongoose");
const { Schema, model, models } = mongoose; // ✅ destructure model & models

const UserSchema = new Schema({
    fullname: { type: String },
    email: { type: String },
    password: { type: String },
    createdOn: { type: Date, default: () => Date.now() }, // ✅ Date.now is better
    otp: { type: String },
    otpExpiry:{type:Date},
});

// ✅ Use existing model if it exists, otherwise create it
const User = models.User || model('User', UserSchema, 'users');

module.exports = User;
