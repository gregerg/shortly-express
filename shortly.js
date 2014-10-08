var express = require('express');
var util = require('./lib/utility');
var partials = require('express-partials');
var bodyParser = require('body-parser');
var cookieParser = require('cookie-parser');
var session = require('express-session');
var bcrypt = require('bcrypt-nodejs');
var methodOverride = require('method-override');
var passport = require('passport');
var GitHubStrategy = require('passport-github').Strategy;
var morgan = require('morgan');

var db = require('./app/config');
var Users = require('./app/collections/users');
var User = require('./app/models/user');
var Links = require('./app/collections/links');
var Link = require('./app/models/link');
var Click = require('./app/models/click');

var app = express();

var GITHUB_CLIENT_ID = "8927253e3faa24c169f1"
var GITHUB_CLIENT_SECRET = "a11be2b14296297c5c212884f8fe595436b84b4b";


passport.serializeUser(function(user, done) {
  done(null, user);
});

passport.deserializeUser(function(obj, done) {
  done(null, obj);
});

passport.use(new GitHubStrategy({
    clientID: GITHUB_CLIENT_ID,
    clientSecret: GITHUB_CLIENT_SECRET,
    callbackURL: "http://127.0.0.1:4568/auth/github/callback"
  },
  function(accessToken, refreshToken, profile, done) {
    // asynchronous verification, for effect...
    process.nextTick(function () {

      // To keep the example simple, the user's GitHub profile is returned to
      // represent the logged-in user.  In a typical application, you would want
      // to associate the GitHub account with a user record in your database,
      // and return that user instead.
      return done(null, profile);
    });
  }
));


app.set('views', __dirname + '/views');
app.set('view engine', 'ejs');
app.use(morgan('dev'));
app.use(partials());
app.use(session({secret: 'keyboard catniss everbean',
                 saveUninitialized: true,
                 resave: true}));
app.use(passport.initialize());
app.use(passport.session());
app.use(methodOverride());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.use(express.static(__dirname + '/public'));

var restrict = function(req, res, next) {
  console.log('restrict function: user object = ',req.user);
  if (req.isAuthenticated()) {
    debugger;
    return next();
  }
  res.redirect('/login');
};

app.get('/', restrict,
function(req, res) {
  res.render('index');
  // res.render('index', { user: req.user });
});

app.get('/create', restrict,
function(req, res) {
  res.render('index');
});

app.get('/links', restrict,
function(req, res) {
  Links.reset().fetch().then(function(links) {
    res.send(200, links.models);
  });
});

app.post('/links', restrict,
function(req, res) {
  var uri = req.body.url;

  if (!util.isValidUrl(uri)) {
    console.log('Not a valid url: ', uri);
    return res.send(404);
  }

  new Link({ url: uri }).fetch().then(function(found) {
    if (found) {
      res.send(200, found.attributes);
    } else {
      util.getUrlTitle(uri, function(err, title) {
        if (err) {
          console.log('Error reading URL heading: ', err);
          return res.send(404);
        }

        var link = new Link({
          url: uri,
          title: title,
          base_url: req.headers.origin
        });

        link.save().then(function(newLink) {
          Links.add(newLink);
          res.send(200, newLink);
        });
      });
    }
  });
});

/************************************************************/
// Write your authentication routes here
/************************************************************/


app.get('/account', restrict, function(req, res){
  res.render('account', { user: req.user });
});

app.get('/auth/github', passport.authenticate('github'));

app.get('/auth/github/callback',
  passport.authenticate('github', { failureRedirect: '/login' }),
  function(req, res) {
    console.log('auth/github/callback: id:', req.user.id, 'username:', req.user.username);
    res.redirect('/');
  }
);

app.get('/login', function(req, res) {
   res.render('login');
});

app.post('/login', function(req, res) {
  var username = req.body.username;
  var password = req.body.password;

  db.knex('users')
    .where('username', '=', username)
    .then(function(users) {
      if (users.length !== 0 && users['0'].username === username) {
        var hash = bcrypt.hashSync(password, users['0'].salt);
        if (hash === users['0'].password) {
          req.session.regenerate(function() {
          req.session.user = username;
          res.redirect('/');
          });
        } else {
          res.redirect('/login');
        }
      } else {
        res.redirect('/login');
      }
    });
});

app.get('/signup', function(req, res) {
   res.render('signup');
});

app.post('/signup', function(req, res) {
  var username = req.body.username;
  var password = req.body.password;
  var user = new User({
    username: username,
    password: password
  });

  user.save().then(function() {
    req.session.regenerate(function() {
      req.session.user = username;
      res.redirect('/');
    });
  });
});

app.get('/logout', function(req, res) {
  req.logout();
  res.redirect('/');
});


app.get('/restricted', restrict, function(req, res) { //restrict
  res.send('This is a restricted area' + req.session.user + '<a href ="/logout">Click Here To Logout</a>');
});


/************************************************************/
// Handle the wildcard route last - if all other routes fail
// assume the route is a short code and try and handle it here.
// If the short-code doesn't exist, send the user to '/'
/************************************************************/

app.get('/*', function(req, res) {
  new Link({ code: req.params[0] }).fetch().then(function(link) {
    if (!link) {
      res.redirect('/');
    } else {
      var click = new Click({
        link_id: link.get('id')
      });

      click.save().then(function() {
        db.knex('urls')
          .where('code', '=', link.get('code'))
          .update({
            visits: link.get('visits') + 1,
          }).then(function() {
            return res.redirect(link.get('url'));
          });
      });
    }
  });
});

console.log('Shortly is listening on 4568');
app.listen(4568);
