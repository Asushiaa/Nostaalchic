require('dotenv').config(); // Charge les variables d'environnement à partir du fichier .env

const mongoose = require('mongoose');

mongoose.connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
})
.then(() => {
    console.log("Connexion à la base de données réussie");
})
.catch((err) => {
    console.error("Erreur de connexion à la base de données:", err);
});
