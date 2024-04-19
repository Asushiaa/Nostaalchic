const express = require('express');
const router = express.Router();
const User = require('./../models/User');
const UserVerification = require("./../models/UserVerification");
const nodemailer = require("nodemailer");
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcrypt');
const path = require("path");
require("dotenv").config();

let transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: process.env.AUTH_EMAIL,
        pass: process.env.AUTH_PASS,
    }
});

// Vérification du transporteur de messagerie
transporter.verify((error, success) => {
    if (error) {
        console.error(error);
    } else {
        console.log("Prêt pour l'envoi de messages");
    }
});

router.post('/signup', (req, res) => {
    let { lastname,firstname, email, password, dateOfBirth } = req.body;
    lastname = lastname.trim();
    firstname=firstname.trim();
    email = email.trim();
    password = password.trim();
    dateOfBirth = dateOfBirth.trim();

    // Vérifiez si les champs sont vides
    if (lastname === ""|| firstname==="" || email === "" || password === "" || dateOfBirth === "") {
        return res.json({
            status: "FAILED",
            message: "Des champs vides!"
        });
    }

    // Vérifiez le format du nom
    if (!/^[a-zA-Z ]*$/.test(lastname)) {
        return res.json({
            status: "FAILED",
            message: "Nom invalide"
        });
    }

    // Vérifiez le format du prénom
    if (!/^[a-zA-Z ]*$/.test(firstname)) {
        return res.json({
            status: "FAILED",
            message: "Nom invalide"
        });
    }

    // Vérifiez le format de l'email
    if (!/^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$/.test(email)) {
        return res.json({
            status: "FAILED",
            message: "Email invalide"
        });
    }

    // Vérifiez la validité de la date de naissance
    if (!Date.parse(dateOfBirth)) {
        return res.json({
            status: "FAILED",
            message: "Date de naissance invalide"
        });
    }

    // Vérifiez la longueur du mot de passe
    if (password.length < 8) {
        return res.json({
            status: "FAILED",
            message: "Le mot de passe est trop court"
        });
    }

    // Vérifiez si l'utilisateur existe déjà
    User.findOne({ email })
        .then(result => {
            if (result) {
                return res.json({
                    status: "FAILED",
                    message: "Un utilisateur avec cet email existe déjà"
                });
            } else {
                // Hachez le mot de passe
                bcrypt.hash(password, 10)
                    .then(hashedPassword => {
                        const newUser = new User({
                            lastname,
                            firstname,
                            email,
                            password: hashedPassword,
                            dateOfBirth,
                            verified: false
                        });
                        newUser.save()
                            .then(result => {
                                sendVerificationEmail(result, res);
                            })
                            .catch(err => {
                                console.error(err);
                                res.json({
                                    status: "FAILED",
                                    message: "Une erreur s'est produite lors de l'enregistrement du mot de passe!"
                                });
                            });
                    })
                    .catch(err => {
                        console.error(err);
                        res.json({
                            status: "FAILED",
                            message: "Une erreur s'est produite lors du hachage du mot de passe!"
                        });
                    });
            }
        })
        .catch(err => {
            console.error(err);
            res.json({
                status: "FAILED",
                message: "Une erreur s'est produite lors de la vérification de l'utilisateur existant"
            });
        });
});

// Fonction pour envoyer l'email de vérification
const sendVerificationEmail = ({ _id, email }, res) => {
    const currentUrl = "http://localhost:3026/";
    const uniqueString = uuidv4(); 

    const mailOptions = {
        from: process.env.AUTH_EMAIL,
        to: email,
        subject: "Vérifiez votre email",
        html: `<p>Veuillez vérifier votre adresse e-mail pour terminer votre inscription et vous connecter à votre compte.</p><p>Ce lien <b>expire dans 6 heures</b>.</p><p>Appuyez <a href="${currentUrl}user/verify/${_id}/${uniqueString}">ici</a> pour continuer.</p>`
    };

    const newVerification = new UserVerification({
        userId: _id,
        uniqueString: bcrypt.hashSync(uniqueString, 10),
        createdAt: Date.now(),
        expiresAt: Date.now() + 21600000 // 6 heures
    });

    newVerification.save()
        .then(() => {
            transporter.sendMail(mailOptions)
                .then(() => {
                    res.json({
                        status: "PENDING",
                        message: "Email de vérification envoyé",
                    });
                })
                .catch((error) => {
                    console.error(error);
                    res.json({
                        status: "FAILED",
                        message: "Échec de l'envoi de l'email de vérification",
                    });
                });
        })
        .catch((error) => {
            console.error(error);
            res.json({
                status: "FAILED",
                message: "Impossible de sauvegarder la vérification !!",
            });
        });
};

router.get("/verify/:userId/:uniqueString", (req, res) => {
    const { userId, uniqueString } = req.params;

    console.log("User ID:", userId);
    console.log("Unique String:", uniqueString);

    UserVerification.findOne({ userId })
        .then((verificationRecord) => {
            console.log("Verification Record:", verificationRecord);

            if (!verificationRecord) {
                const message = "Account record doesn't exist or has been verified already. Please sign up or log in";
                return res.redirect(`/user/verified?error=true&message=${message}`);
            }

            const { expiresAt, uniqueString: hashedUniqueString } = verificationRecord;

            if (expiresAt < Date.now()) {
                UserVerification.deleteOne({ userId })
                    .then(() => {
                        User.deleteOne({ _id: userId })
                            .then(() => {
                                const message = "Link has expired. Please sign up again";
                                res.redirect(`/user/verified?error=true&message=${message}`);
                            })
                            .catch((error) => {
                                console.error(error);
                                const message = "Deleting user with expired unique string failed!";
                                res.redirect(`/user/verified?error=true&message=${message}`);
                            });
                    })
                    .catch((error) => {
                        console.error(error);
                        const message = "An error occurred while clearing expired user verification record";
                        res.redirect(`/user/verified?error=true&message=${message}`);
                    });
            } else {
                bcrypt.compare(uniqueString, hashedUniqueString)
                    .then((result) => {
                        console.log("Compare Result:", result);

                        if (result) {
                            User.updateOne({ _id: userId }, { verified: true })
                                .then(() => {
                                    UserVerification.deleteOne({ userId })
                                        .then(() => {
                                            res.redirect("/user/verified");
                                        })
                                        .catch((error) => {
                                            console.error(error);
                                            const message = "An error occurred while finalizing successful verification";
                                            res.redirect(`/user/verified?error=true&message=${message}`);
                                        });
                                })
                                .catch((error) => {
                                    console.error(error);
                                    const message = "An error occurred while updating user record to show verified";
                                    res.redirect(`/user/verified?error=true&message=${message}`);
                                });
                        } else {
                            const message = "Invalid verification details passed, check your inbox";
                            res.redirect(`/user/verified?error=true&message=${message}`);
                        }
                    })
                    .catch((error) => {
                        console.error(error);
                        const message = "An error occurred while comparing unique string";
                        res.redirect(`/user/verified?error=true&message=${message}`);
                    });
            }
        })
        .catch((error) => {
            console.error(error);
            const message = "An error occurred while checking for existing user verification record";
            res.redirect(`/user/verified?error=true&message=${message}`);
        });
});

router.get("/verified", (req, res) => {
    res.sendFile(path.join(__dirname, "./../views/verified.html"));
});

router.post('/signin', (req, res) => {
    let { email, password, dateOfBirth } = req.body;
    email = email.trim();
    password = password.trim();

    if (email === "" || password === "") {
        return res.json({
            status: "FAILED",
            message: "Empty credentials supplied"
        });
    }

    User.find({ email })
        .then(data => {
            if (data.length) {
                if (!data[0].verified) {
                    return res.json({
                        status: "FAILED",
                        message: "Email hasn't been verified yet. Check your inbox"
                    });
                } else {
                    const hashedPassword = data[0].password;
                    bcrypt.compare(password, hashedPassword)
                        .then(result => {
                            if (result) {
                                return res.json({
                                    status: "SUCCESS",
                                    message: "Signin successful",
                                    data: data
                                });
                            } else {
                                return res.json({
                                    status: "FAILED",
                                    message: "Invalid password entered!"
                                });
                            }
                        })
                        .catch(err => {
                            return res.json({
                                status: "FAILED",
                                message: "An error occurred while comparing passwords",
                            });
                        });
                }
            } else {
                return res.json({
                    status: "FAILED",
                    message: "Invalid credentials entered!"
                });
            }
        })
        .catch(err => {
            return res.json({
                status: "FAILED",
                message: "An error occurred while checking for existing user!"
            });
        });
});

const randomPassword = Math.random().toString(36).slice(-8); // Générer un mot de passe temporaire aléatoire

router.post('/forgot-password', (req, res) => {
    const { email } = req.body;
    if (!email) {
        return res.json({
            status: "FAILED",
            message: "Veuillez fournir une adresse email"
        });
    }

    User.findOne({ email })
        .then(user => {
            if (!user) {
                return res.json({
                    status: "FAILED",
                    message: "Aucun utilisateur trouvé avec cet email"
                });
            }

            // Mettre à jour le mot de passe de l'utilisateur avec un nouveau mot de passe temporaire
            bcrypt.hash(randomPassword, 10)
                .then(hashedPassword => {
                    user.password = hashedPassword;
                    user.save()
                        .then(() => {
                            // Envoyer l'email de réinitialisation avec le nouveau mot de passe temporaire
                            const mailOptions = {
                                from: process.env.AUTH_EMAIL,
                                to: email,
                                subject: "Réinitialisation de mot de passe",
                                html: `<p>Votre nouveau mot de passe temporaire est : <strong>${randomPassword}</strong></p>`
                            };
                            transporter.sendMail(mailOptions)
                                .then(() => {
                                    return res.json({
                                        status: "SUCCESS",
                                        message: "Email de réinitialisation envoyé"
                                    });
                                })
                                .catch(error => {
                                    console.error(error);
                                    return res.json({
                                        status: "FAILED",
                                        message: "Erreur lors de l'envoi de l'email de réinitialisation"
                                    });
                                });
                        })
                        .catch(error => {
                            console.error(error);
                            return res.json({
                                status: "FAILED",
                                message: "Une erreur s'est produite lors de la mise à jour du mot de passe"
                            });
                        });
                })
                .catch(error => {
                    console.error(error);
                    return res.json({
                        status: "FAILED",
                        message: "Une erreur s'est produite lors du hachage du nouveau mot de passe"
                    });
                });
        })
        .catch(error => {
            console.error(error);
            return res.json({
                status: "FAILED",
                message: "Une erreur s'est produite lors de la recherche de l'utilisateur"
            });
        });
});

router.post('/change-password', (req, res) => {
    let { email, currentPassword, newPassword } = req.body;
    email = email.trim();
    currentPassword = currentPassword.trim();
    newPassword = newPassword.trim();

    if (email === "" || currentPassword === "" || newPassword === "") {
        return res.json({
            status: "FAILED",
            message: "Des champs vides!"
        });
    }

    User.findOne({ email })
        .then(user => {
            if (!user) {
                return res.json({
                    status: "FAILED",
                    message: "Aucun utilisateur trouvé avec cet email"
                });
            }

            // Vérifiez si le mot de passe actuel est correct
            bcrypt.compare(currentPassword, user.password)
                .then(passwordsMatch => {
                    if (!passwordsMatch) {
                        return res.json({
                            status: "FAILED",
                            message: "Mot de passe actuel incorrect"
                        });
                    }

                    // Hachez le nouveau mot de passe et mettez à jour le mot de passe de l'utilisateur
                    bcrypt.hash(newPassword, 10)
                        .then(hashedPassword => {
                            User.updateOne({ email }, { password: hashedPassword })
                                .then(() => {
                                    return res.json({
                                        status: "SUCCESS",
                                        message: "Mot de passe mis à jour avec succès"
                                    });
                                })
                                .catch(err => {
                                    console.error(err);
                                    return res.json({
                                        status: "FAILED",
                                        message: "Une erreur s'est produite lors de la mise à jour du mot de passe"
                                    });
                                });
                        })
                        .catch(err => {
                            console.error(err);
                            return res.json({
                                status: "FAILED",
                                message: "Une erreur s'est produite lors du hachage du nouveau mot de passe"
                            });
                        });
                })
                .catch(err => {
                    console.error(err);
                    return res.json({
                        status: "FAILED",
                        message: "Une erreur s'est produite lors de la comparaison des mots de passe"
                    });
                });
        })
        .catch(err => {
            console.error(err);
            return res.json({
                status: "FAILED",
                message: "Une erreur s'est produite lors de la recherche de l'utilisateur"
            });
        });
});


module.exports = router;
