const { ObjectId } = require("mongodb");
const mongoose = require("mongoose");

// Veritabanı bağlantısı
const connect = mongoose.connect("mongodb+srv://huzeyfeatc9:XwjBEo6khRtalkfs@movieapp.rhykss9.mongodb.net/movieApp");

connect.then(() => {
    console.log("Database connected succesfully");
})
.catch(() => {
    console.log("Database cannot be connected");
});

// Kullanıcı schema'sı
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

// Kullanıcı listesi schema'sı
const UserListSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId, // Kullanıcı kimliği
        required: true
    },
    listType: {
        type: String,
        enum: ['favorites', 'watchlist'], // Sadece belirli listeleri kabul eder
        required: true
    },
    movieId: {
        type: String, // TMDB veya benzeri bir platformdan alınan film kimliği
        required: true
    }
});

const customListSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'users', // Kullanıcı modeline referans
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

// Kullanıcı modeli
const User = mongoose.model("users", LoginSchema);
const CustomList = mongoose.model('CustomList', customListSchema);
// Kullanıcı listesi modeli
const UserList = mongoose.model("userList", UserListSchema);

// Modülleri dışa aktar
module.exports = {
    User,
    UserList,
    CustomList
};
