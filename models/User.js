const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const UserSchema = new Schema({
    lastname: String,
    firstname: String,
    email: String,
    password: String,
    dateOfBirth: Date,
    verified: Boolean,
    isAdmin: {
        type: Boolean,
        default: false // Par défaut, les nouveaux utilisateurs ne sont pas des administrateurs
    }
});

const User = mongoose.model('User', UserSchema);

module.exports = User;
