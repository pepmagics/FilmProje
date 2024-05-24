const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const fetch = require('node-fetch');
const { User, UserList, CustomList } = require('./config');
const helmet = require('helmet');
const compression = require('compression');

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

app.use(helmet());
app.use(compression());
app.use((req, res, next) => {
    res.locals.isLoggedIn = req.isAuthenticated();
    res.locals.user = req.user || null;
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

app.get('/logout', (req, res) => {
    req.logOut(() => {
        res.redirect('/');
    });
});


// Render list creation page
app.get('/profile/:username/lists/create', (req, res) => {
    if (!req.isAuthenticated()) {
        return res.redirect('/login');
    }
    res.render('list-create');
});

// Handle dynamic movie search
app.get('/search/movies', async (req, res) => {
    const apiKey = process.env.API_KEY;
    const query = req.query.query;

    try {
        const url = `https://api.themoviedb.org/3/search/movie?query=${query}&language=en-US&api_key=${apiKey}`;
        const response = await fetch(url);
        const data = await response.json();
        res.json(data.results);
    } catch (error) {
        console.error('Error fetching movies:', error);
        res.status(500).send('Error fetching movies');
    }
});

// Handle list creation
app.post('/profile/lists/create', async (req, res) => {
    if (!req.isAuthenticated()) {
        return res.status(401).send('Unauthorized');
    }

    const { title, description, movies } = req.body;

    try {
        const newList = new CustomList({
            userId: req.user._id,
            title,
            description,
            movies
        });

        await newList.save();
        res.status(200).send('List created successfully');
    } catch (error) {
        console.error('Error creating list:', error);
        res.status(500).send('Error creating list');
    }
});

// Belirli bir listeyi göster
app.get('/list/:id', async (req, res) => {
    try {
        const list = await CustomList.findById(req.params.id).populate('userId', 'username');
        if (!list) {
            return res.status(404).send('List not found');
        }

        // Oturum açmış olan kullanıcının kimliği
        const loggedInUserId = req.isAuthenticated() ? req.user._id.toString() : null;

        // Listenin sahibinin kimliği
        const listOwnerId = list.userId._id.toString();

        // Eğer liste paylaşılan bir liste değilse ve oturum açmış kullanıcı liste sahibi değilse, yönlendirme yap
        if (!list.isShared && loggedInUserId !== listOwnerId) {
            return res.redirect('/');
        }

        const apiKey = process.env.API_KEY;
        const movieIds = list.movies.map(movie => movie.movieId);

        // API çağrıları için bir dizi oluştur
        const apiCalls = movieIds.map(movieId => {
            const url = `https://api.themoviedb.org/3/movie/${movieId}?&language=tr-TR&&api_key=${apiKey}`;
            return fetch(url).then(response => response.json());
        });

        // Tüm API çağrılarını aynı anda başlat ve sonuçları bekle
        const movies = await Promise.all(apiCalls);

        // Movies array'ini güncelle
        const updatedMovies = list.movies.map(movie => {
            const movieDetails = movies.find(m => m.id == movie.movieId);
            return {
                movieId: movie.movieId,
                title: movieDetails.title,
                posterPath: movieDetails.poster_path
            };
        });

        res.render('list-details', { list, movies: updatedMovies});
    } catch (error) {
        console.error('Hata:', error);
        res.status(500).send('Bir hata oluştu.');
    }
});

// Paylaşılan listeleri göster
app.get('/shared-lists', async (req, res) => {
    try {
        const sharedLists = await CustomList.find({ isShared: true }).populate('userId', 'username');
        res.render('shared-lists', { sharedLists });
    } catch (error) {
        console.error('Hata:', error);
        res.status(500).send('Bir hata oluştu.');
    }
});

app.post('/share-list', async (req, res) => {
    if (!req.isAuthenticated()) {
        return res.status(401).send({ success: false, message: 'Unauthorized' });
    }

    const { listId } = req.body;

    try {
        await CustomList.findByIdAndUpdate(listId, { isShared: true });
        res.send({ success: true });
    } catch (error) {
        console.error('Liste paylaşma hatası:', error);
        res.status(500).send({ success: false, message: 'Liste paylaşma hatası' });
    }
});

// Fetch custom lists
app.get('/profile/:username/lists', async (req, res) => {
    if (!req.isAuthenticated()) {
        return res.redirect('/login');
    }

    try {
        const customLists = await getCustomLists(req.user._id);
        res.render('lists', { customLists });
    } catch (error) {
        console.error('Error fetching custom lists:', error);
        res.status(500).send('An error occurred.');
    }
});

// Function to get custom lists
async function getCustomLists(userId) {
    const customLists = await CustomList.find({ userId });

    return customLists;
}

app.get('/profile/:username', async (req, res) => {
    if (!req.isAuthenticated()) {
        return res.redirect('/login');
    }
    
    try {
        
        res.render('profile');
    } catch (error) {
        console.error('Hata:', error);
        res.status(500).send('Bir hata oluştu.');
    }
});

app.get('/profile/:username/favorites', async (req, res) => {
    if (!req.isAuthenticated()) {
        return res.redirect('/login');
    }
    
    try {
        const favorites = await getFavorites(req.user._id);
        res.render('favorites', { favorites });
    } catch (error) {
        console.error('Hata:', error);
        res.status(500).send('Bir hata oluştu.');
    }
});

app.get('/profile/:username/watchlist', async (req, res) => {
    if (!req.isAuthenticated()) {
        return res.redirect('/login');
    }
    
    try {
        const watchlist = await getWatchlist(req.user._id);
        res.render('watchlist', { watchlist });
    } catch (error) {
        console.error('Hata:', error);
        res.status(500).send('Bir hata oluştu.');
    }
});

async function getFavorites(userId) {
    const favorites = await UserList.find({ userId, listType: 'favorites' });
    const apiKey = process.env.API_KEY;

    // API çağrıları için bir dizi oluştur
    const apiCalls = favorites.map(favorite => {
        const url = `https://api.themoviedb.org/3/movie/${favorite.movieId}?&language=tr-TR&&api_key=${apiKey}`;
        return fetch(url).then(response => response.json());
    });

    // Tüm API çağrılarını aynı anda başlat ve sonuçları bekle
    const favoriteMovies = await Promise.all(apiCalls);

    return favoriteMovies;
}

async function getWatchlist(userId) {
    const watchlists = await UserList.find({ userId, listType: 'watchlist' });
    const apiKey = process.env.API_KEY;

    // API çağrıları için bir dizi oluştur
    const apiCalls = watchlists.map(watchlist => {
        const url = `https://api.themoviedb.org/3/movie/${watchlist.movieId}?&language=tr-TR&&api_key=${apiKey}`;
        return fetch(url).then(response => response.json());
    });

    // Tüm API çağrılarını aynı anda başlat ve sonuçları bekle
    const watchListMovies = await Promise.all(apiCalls);

    return watchListMovies;
}

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
