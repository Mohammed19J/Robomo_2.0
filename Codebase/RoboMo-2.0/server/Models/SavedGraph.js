const mongoose = require("mongoose");

const SavedGraphSchema = new mongoose.Schema({
    userId: {
        type: String,
        required: true,
        index: true,
    },
    deviceID: {
        type: String,
        required: true,
    },
    deviceType: {
        type: String,
        required: true,
    },
    attributeKey: {
        type: String,
        required: true,
    },
    startDateTime: {
        type: Date,
        required: true,
    },
    endDateTime: {
        type: Date,
        required: true,
    },
    lastX: {
        type: Number,
        default: 1000,
    },
    color: {
        type: String,
        default: "#304463",
    },
    values: {
        type: Array,
        default: [],
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
});

module.exports = mongoose.model("SavedGraph", SavedGraphSchema);
