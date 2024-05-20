const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const fetch = require('node-fetch');
const { User, UserList } = require('./config');
require('dotenv').config();
const bcrypt = require('bcrypt');
const passport = require('passport');
const flash = require('express-flash');
const LocalStrategy = require('passport-local').Strategy;
const session = require('express-session');
const http = require('http');
const socketIo = require('socket.io');


const app = express();
const server = http.createServer(app);
const io = socketIo(server);


// Middleware'leri tanımla
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));
app.set('view engine', 'ejs');


// Oturum yönetimi için middleware'leri tanımla
app.use(session({
    secret: 'secret-key',
    resave: false,
    saveUninitialized: false,   
    cookie: { maxAge: 3600000 }
}));

app.use(passport.initialize());
app.use(passport.session());

app.use(flash());


app.use((req, res, next) => {
    res.locals.isLoggedIn = req.isAuthenticated();
    next();
});

    
// Yerel kimlik doğrulama stratejisini tanımla
passport.use(new LocalStrategy(async (username, password, done) => {
    try {
        const user = await User.findOne({ username: username });
        if (!user) {
            return done(null, false, { message: 'Kullanıcı adı bulunamadı' });
        }
        const isPasswordMatch = await bcrypt.compare(password, user.password);
        if (!isPasswordMatch) {
            return done(null, false, { message: 'Yanlış şifre veya kullanıcı adı' });
        }
        return done(null, user);
    } catch (error) {
        return done(error);
    }
}));

// Kullanıcı kimliğini oturumda sakla
passport.serializeUser((user, done) => {
    done(null, user.id);
});

// Oturumdaki kullanıcı kimliğini kullanarak kullanıcıyı getir  
passport.deserializeUser(async (id, done) => {
    try {
        const user = await User.findById(id);
        done(null, user);
    } catch (error) {
        done(error);
    }
});

// Ana sayfayı göster
app.get('/', async (req, res) => {
    try {
        const apiKey = process.env.API_KEY;
        const url = `https://api.themoviedb.org/3/movie/now_playing?language=en-US&page=1&api_key=${apiKey}`
        const response = await fetch(url);
        const data = await response.json();
        res.render('index', { 
            movies: data.results,
            message: req.flash('message') // Flash mesajını index.ejs'e geçir
        });
    } catch (error) {
        console.error('Hata:', error);
        res.status(500).send('Bir hata oluştu.');
    }
});

// Belirli bir filmi göster
app.get('/movie/:id', async (req, res) => {
    const movieId = req.params.id;
    try {
        const apiKey = process.env.API_KEY;
        const url = `https://api.themoviedb.org/3/movie/${movieId}?&language=tr-TR&&api_key=${apiKey}`;
        const url2 = `https://api.themoviedb.org/3/movie/${movieId}/videos?&language=en-US&api_key=${apiKey}`;
        const userid = req.user ? req.user._id : null;

        // İlk fetch işlemi
        const response1 = await fetch(url);
        const movie = await response1.json();

        // İkinci fetch işlemi
        const response2 = await fetch(url2);
        const video = await response2.json();

        let isFavoriteClass = '';
        let notFavoriteClass = '';
        let isWatchListClass = '';
        let notWatchListClass = '';

        if (req.isAuthenticated()) {
            let exist = await UserList.exists({ userId: req.user._id, listType: 'favorites', movieId });
            let existingWatchList = await UserList.exists({ userId: req.user._id, listType: 'watchlist', movieId });
            // Sunucu tarafında isFavorite değerine göre CSS sınıfı belirleme
            
            if (exist) {
                notFavoriteClass = 'not-visible';
            } else {
                isFavoriteClass = 'not-visible';
            }

            if (existingWatchList) {
                notWatchListClass = 'not-visible';
            } else {
                isWatchListClass = 'not-visible';
            }
            
            res.render('movie', { movie, video, movieId, userid, isFavoriteClass, notFavoriteClass, isWatchListClass, notWatchListClass});
        }
        else {
            res.render('movie', { movie, video, movieId, userid, isFavoriteClass: 'not-visible', notFavoriteClass, isWatchListClass: 'not-visible', notWatchListClass});
        }
    } catch (error) {
        console.error('Hata:', error);
        res.status(500).send('Bir hata oluştu.');
    }
});

// Arama sonuçlarını göster
app.get('/search', async (req, res) => {
    try {
        const apiKey = process.env.API_KEY;
        const query = req.query.query;
        const page = req.query.page || 1;
        const url = `https://api.themoviedb.org/3/search/movie?query=${query}&include_adult=false&language=tr-TR&page=${page}&api_key=${apiKey}`;
        const response = await fetch(url);
        const data = await response.json();
        const totalPages = data.total_pages;
        const currentPage = data.page;
        res.render('search', { movies: data.results, query, totalPages, currentPage });
    } catch (error) {
        console.error('Hata:', error);
        res.status(500).send('Bir hata oluştu.');
    }
});

// Kayıt sayfasını göster
app.get("/signup", (req, res) => {
    if (req.isAuthenticated()) {
        return res.redirect('/');
    }
    res.render("signup");
});

// Giriş sayfasını göster
app.get("/login", (req, res) => {

    if (req.isAuthenticated()) {
        return res.redirect('/');
    }
    res.render("login", { message: req.flash("error") });
});

// Kullanıcı kayıt işlemini gerçekleştir
app.post("/signup", async (req, res) => {
    const { username, email, password, password2 } = req.body;

    let checkingMessage = true; // Default olarak true ayarlandı

    // Kullanıcı adı zaten kullanımda mı kontrol et
    const existingUser = await await User.findOne({ username });
    if (existingUser) {
        return res.render("signup", { message: "Kullanıcı zaten kayıtlı. Lütfen farklı bir kullanıcı adı seçin.", checkingMessage });
    }

    // Şifrelerin eşleştiğini kontrol et
    if (password !== password2) {
        return res.render("signup", { message: "Şifreler eşleşmiyor", checkingMessage });
    }

    // Şifreyi hashle ve kullanıcıyı kaydet
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);
    await User.insertMany({ username, email, password: hashedPassword });

    checkingMessage = false; // Başarılı kayıt durumunda false yapılıyor

    res.render("signup", { message: "Kullanıcı başarıyla kaydedildi", checkingMessage });
});

app.post('/logout', (req, res) => {
    req.logOut(() => {
        res.redirect('/');
    });
});

app.get('/profile', (req, res) => {
    if (!req.isAuthenticated()) {
        return res.redirect('/login');
    }
    res.render('profile', { user: req.user });
});


// Favoriler sayfasını göster
app.get('/favorites', async (req, res) => {
    try {
        // Kullanıcı oturum açmış mı kontrol et
        if (!req.isAuthenticated()) {
            return res.redirect('/login'); // Oturum açmamışsa giriş sayfasına yönlendir
        }
        
        // Kullanıcının favori filmlerini veri tabanından al
        const favorites = await UserList.find({ userId: req.user._id, listType: 'favorites' });

        // Favori filmleri listesi
        const favoriteMovies = [];

        // Her bir favori filmin API isteğini yap ve diziye ekle
        for (const favorite of favorites) {
            const apiKey = process.env.API_KEY;
            const url = `https://api.themoviedb.org/3/movie/${favorite.movieId}?&language=tr-TR&&api_key=${apiKey}`;
            const response = await fetch(url);
            const movie = await response.json();
            favoriteMovies.push(movie);
        }
        // Favori filmleri kullanıcıya göstermek için bir view oluştur ve render et
        res.render('favorites', { movies: favoriteMovies });
    } catch (error) {
        console.error('Hata:', error);
        res.status(500).send('Bir hata oluştu.');
    }
});

app.get('/watchlist', async (req, res) => {
    try {
        // Kullanıcı oturum açmış mı kontrol et
        if (!req.isAuthenticated()) {
            return res.redirect('/login'); // Oturum açmamışsa giriş sayfasına yönlendir
        }
        
        // Kullanıcının favori filmlerini veri tabanından al
        const watchlists = await UserList.find({ userId: req.user._id, listType: 'watchlist' });

        // Favori filmleri listesi
        const watchListMovies = [];

        // Her bir favori filmin API isteğini yap ve diziye ekle
        for (const watchlist of watchlists) {
            const apiKey = process.env.API_KEY;
            const url = `https://api.themoviedb.org/3/movie/${watchlist.movieId}?&language=tr-TR&&api_key=${apiKey}`;
            const response = await fetch(url);
            const movie = await response.json();
            watchListMovies.push(movie);
        }
        // Favori filmleri kullanıcıya göstermek için bir view oluştur ve render et
        res.render('watchlist', { movies: watchListMovies });
    } catch (error) {
        console.error('Hata:', error);
        res.status(500).send('Bir hata oluştu.');
    }
});

// Kullanıcı giriş işlemini gerçekleştir
app.post("/login", passport.authenticate('local', {
    successRedirect: '/',
    failureRedirect: '/login',
    failureFlash: true
}));

io.on('connection', (socket) => {
    console.log('Yeni bir kullanıcı bağlandı.');

    socket.on('favoriEkle', async (movieId, userId) => {
        try {
            // Favori ekleme işleminden önce var olan favorileri kontrol et
            const existingFavorite = await UserList.exists({ userId, listType: 'favorites', movieId });
    
            if (existingFavorite) {
                // Eğer film zaten favorilere eklenmişse, istemciye bir uyarı gönder
                console.log('Film zaten favorilere eklenmiş.');
                socket.emit('favoriEklendi');
            } else {
                // Favori ekleme işlemi
                await UserList.create({ userId, listType: 'favorites', movieId });
                console.log('Favori eklendi:', movieId, userId);
                socket.emit('favoriEklendi');
            }
        } catch (error) {
            console.error('Favori ekleme hatası:', error);
        }
    });

    // Favori silme işlemi
    socket.on('favoriSil', async (movieId, userId) => {
        try {
            
            // Favori silme işlemi
            await UserList.deleteOne({ userId, listType: 'favorites', movieId });
            socket.emit('favoriSilindi');

        } catch (error) {
            console.error('Favori silme hatası:', error);
        }
    });

    socket.on('takipListeEkle', async (movieId, userId) => {
        try {

            const existingWatchList = await UserList.exists({ userId, listType: 'watchlist', movieId });

            if (existingWatchList) {
                // Eğer film zaten takip listesine eklenmişse, istemciye bir uyarı gönder
                console.log('Film zaten takip listesine eklenmiş.');
                socket.emit('takipListeEklendi');
            }
            else{
                // Takip listesi ekleme işlemi
                await UserList.create({ userId, listType: 'watchlist', movieId });
                console.log('Takip liste eklendi:', movieId, userId);
                socket.emit('takipListeEklendi');
            }
        } catch (error) {
            console.error('Takip liste hatası:', error);
        }
    });

    socket.on('takipListeSil', async (movieId, userId) => {
        try {
            // Takip listesi silme işlemi
            await UserList.deleteOne({ userId, listType: 'watchlist', movieId });
            socket.emit('takipListeSilindi');
        } catch (error) {
            console.error('Takip Liste silme hatası:', error);
        }
    });

});

// Uygulamayı belirtilen portta çalıştır
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
