const express = require('express');
const router = express.Router();
const path = require('path');

router.get('/login-signup', (req, res) => {
    res.sendFile(path.join(__dirname, '../views/Loginsignup.html'));
});

module.exports = router;
