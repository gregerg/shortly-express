var db = require('../config');
var bcrypt = require('bcrypt-nodejs');
var Promise = require('bluebird');


var User = db.Model.extend({
  tableName: 'users',

  initialize: function(params) {

    var username = params.username;
    var password = params.password;
    var salt = bcrypt.genSaltSync(10);
    var hash = bcrypt.hashSync(password, salt);
    this.set('username', username);
    this.set('password', hash);
    this.set('salt', salt);
  }

});




module.exports = User;
