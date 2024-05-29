const mongoose = require("mongoose");

// Connect to database
const connect = mongoose.connect("mongodb+srv://huzeyfeatc9:XwjBEo6khRtalkfs@movieapp.rhykss9.mongodb.net/movieApp");

connect.then(() => {
    console.log("Database connected successfully");
}).catch(() => {
    console.log("Database connection failed");
});

// User schema
const LoginSchema = new mongoose.Schema({
    username: {
        type: String,
        required: true
    },
    email: {
        type: String,
        required: true
    },
    password: {
        type: String,
        required: true
    }
});

// User list schema
const UserListSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId, // User ID
        required: true
    },
    listType: {
        type: String,
        enum: ['favorites', 'watchlist'], // Allowed list types
        required: true
    },
    movieId: {
        type: String, // Movie ID from TMDB or similar platform
        required: true
    }
});

const CustomListSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'users', // Reference to user model
        required: true
    },
    title: {
        type: String,
        required: true
    },
    description: {
        type: String,
        required: true
    },
    movies: [{ movieId: String, title: String, posterPath: String }],
    isShared: { type: Boolean, default: false }
});

const CommentSchema = new mongoose.Schema({
    listId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'CustomList',
        required: true
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'users',
        required: true
    },
    comment: {
        type: String,
        required: true
    },
    timestamp: {
        type: Date,
        default: Date.now
    }
});

const LikeSchema = new mongoose.Schema({
    listId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'CustomList',
        required: true
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'users',
        required: true
    }
});

const User = mongoose.model("users", LoginSchema);
const UserList = mongoose.model("userList", UserListSchema);
const CustomList = mongoose.model('CustomList', CustomListSchema);
const Comment = mongoose.model('Comment', CommentSchema);
const Like = mongoose.model('Like', LikeSchema);

// Function to get like count
const getLikeCount = async (listId) => {
    return await Like.countDocuments({ listId });
};

// Export models and utility function
module.exports = {
    User,
    UserList,
    CustomList,
    Comment,
    Like,
    getLikeCount
};
