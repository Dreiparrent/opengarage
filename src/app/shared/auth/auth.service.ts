import { Router } from '@angular/router';
import { Injectable } from '@angular/core';
import { IProfile, Payments, IUser, IUserData, ITags, ICommunityData, ICommunity, placeholderUrl } from '../community/community-interfaces';
import { AngularFirestore, DocumentSnapshot } from 'angularfire2/firestore';
import { AngularFireAuth } from 'angularfire2/auth';
import { DocumentReference } from '@firebase/firestore-types';
import { auth, firestore, User } from 'firebase/app';
import { Observable, BehaviorSubject, Subject } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AngularFireStorage } from 'angularfire2/storage';
import { AlertService, Alerts } from '../alerts/alert.service';
import { CommunityService } from '../community/community.service';
import { Chat, IChat } from '../community/chat';

@Injectable()
export class AuthService {
    private _token: string;
    get token() {
        return this._token;
    }
    userRef: DocumentReference;
    userProvider: string[];
    protected _user: User;
    set user(user: User) {
        this._user = user;
        if (user === null) {
            this._token = null;
            this.isAuth = false;
        } else {
            this._token = user.uid;
            this.isAuth = true;
        }
    }
    get user() {
        return this._user;
    }

    private _isAuth = new BehaviorSubject(false);
    get isAuth() {
        return this._isAuth.getValue();
    }
    set isAuth(authStatus: boolean) {
        if (authStatus && this.user)
            this._isAuth.next(authStatus);
        else if (!authStatus) this._isAuth.next(authStatus);
    }
    userCred: auth.AuthCredential;
    currentUser: IUser;
    currentData: IUserData;
    private _userCommunities = new BehaviorSubject<ICommunity[]>([]);
    private get userCommunities() {
        return this._userCommunities.getValue();
    }
    private set userCommunities(coms: ICommunity[]) {
        this._userCommunities.next(coms);
    }
    public get communities() {
        return this._userCommunities.asObservable();
    }
    /*
    public _userChats = new BehaviorSubject<[DocumentReference, boolean][]>([]);
    public _newChat = new Subject<[DocumentReference, boolean]>();
    private set chats(chat: [DocumentReference, boolean]) {
        const chats = this._userChats.getValue();
        this._newChat.next(chat);
        chats.push(chat);
        console.log('chat', chat);
        this._userChats.next(chats);
    }
    */
    private _userChats = new BehaviorSubject<Chat[]>([]);
    public get chats() {
        return this._userChats.asObservable();
    }
    constructor(private alertService: AlertService,
        private db: AngularFirestore,
        private fireAuth: AngularFireAuth,
        private fireStorage: AngularFireStorage,
        private comService: CommunityService) {
        // this.userRef = db.collection('users').doc('A5LOuQSWacJroy4NuTFg').ref;
        fireAuth.authState.subscribe(user => {
            if (user) {
                this.userRef = this.db.collection('users').doc(user.uid).ref;
                this.user = user;
                this.getChats();
                this.fireAuth.auth.fetchProvidersForEmail(user.email).then(provider => {
                    this.userProvider = provider;
                });
                /*
                .then(an => {
                    this.noProfileError();
                });
                */
            }
        });
        /*
        if (!environment.production)
            this.signinUser(environment.loginInfo.email, environment.loginInfo.password);
        */
    }
//#region Logins
    signinUser(email: string, password: string): Promise<boolean> {
        return this.fireAuth.auth.signInWithEmailAndPassword(email, password).then((result: auth.UserCredential) => {
            this.userCred = result.credential;
            return true;
        }, (error: any) => {
            console.error(error);
            if (error.message === 'The password is invalid or the user does not have a password.')
                this.fireAuth.auth.fetchSignInMethodsForEmail(email).then(providers => {
                    if (providers.includes('google.com'))
                        this.gAuth();
                });
            return false;
        });
    }
    gAuth(): Promise<boolean> {
        return this.fireAuth.auth.signInWithPopup(new auth.GoogleAuthProvider()).then((result: auth.UserCredential) => {
            this.userCred = result.credential;
            this.userProvider = ['google.com'];
            return true;
        }, (error: any) => {
            console.log(error);
            this.alertService.addAlert(Alerts.googleError);
            return false;
        });
    }
    fAuth(): Promise<boolean> {
        return this.fireAuth.auth.signInWithPopup(new auth.FacebookAuthProvider()).then((result: auth.UserCredential) => {
            this.userCred = result.credential;
            return true;
        }, (error: any) => {
            console.log(error);
            return false;
        });
    }
    userExists(email: string, authType = 0): Promise<boolean> {
        /*
        return new Promise<boolean>(res => {
            res(true);
        });
        */
        if (authType === 0)
            return this.fireAuth.auth.fetchSignInMethodsForEmail(email).then(signInMethods => {
                return (signInMethods.length > 0);
            });
        else return this.db.collection('users').doc(this.user.uid).ref
            .collection('userData').doc('profile').get().then(res => res.exists);
    }
    // logout
    logout(): Promise<boolean> {
        return this.fireAuth.auth.signOut().then(result => {
            this.user = null;
            return true;
        }).catch(error => {
            this.alertService.addAlert(Alerts.custom, {
                msg: 'Unable to logout',
                type: 'danger'
            });
            throw new Error(error);
        });
    }
//#endregion

//#region register and update
    registerUser(reg: IRegister): Observable<number> {
        const progress = new Subject<number>();
        progress.next(0);
        this.userExists(reg.email, reg.type).then(doesExist => {
            if (doesExist) {
                this.alertService.addAlert(Alerts.incomplete, true);
                progress.next(100);
            } else {
                const newUserData: IUserData = {
                    profile: {
                        about: reg.about,
                        email: '',
                        fName: reg.fName,
                        lName: reg.lName,
                        location: {
                            location: reg.location,
                            nav: new firestore.GeoPoint(reg.latlng.lat(), reg.latlng.lng())
                        }
                    },
                    tags: {
                        passions: reg.passions,
                        paymentForm: reg.payment,
                        skills: reg.skills
                    }
                };
                const newUser: IUser = {
                    connections: 0,
                    location: reg.location,
                    userData: newUserData
                };
                return new Promise<string>(res => {
                    if (reg.type === 0) {
                        newUserData.profile.email = reg.email;
                        res(this.fireAuth.auth.createUserWithEmailAndPassword(reg.email, reg.pass).then((userRef: auth.UserCredential) => {
                            // TODO: userCred.additionalUserInfo.isNewUser
                            this.user = userRef.user;
                            return userRef.user.uid;
                        }, error => {
                            throw new Error(error);
                        }));
                    } else {
                        newUserData.profile.email = this.user.email;
                        res(this.user.uid);
                    }
                }).then(uid => {
                    progress.next(25);
                    console.log(uid);
                    this.userRef = this.db.collection('users').doc(uid).ref;
                }).then(() => {
                    return this.userRef.set({ new: true }).then(() => true, error => {
                        throw new Error(error);
                    }).then(res => {
                        progress.next(30);
                        return this.userRef.collection('userData').doc('tags').set({
                            passions: [],
                            paymentForm: [],
                            skills: []
                        }).then(() => true, error => { throw new Error(error); });
                    }).then(res => {
                        progress.next(25);
                        return this.userRef.collection('userData').doc('profile').set({})
                            .then(() => true, error => { throw new Error(error); });
                    }).catch(error => {
                        console.error('Error creating user', error);
                        return false;
                    }).then(created => {
                        progress.next(40);
                        if (created)
                            return this.updateProfileInfo([newUser, true]);
                    }).then(newProg => {
                        newProg.subscribe(prog => progress.next(prog));
                    });
                });
            }
        });
        return progress;
    }
    updateProfileInfo(update: [IUser, boolean]): Observable<number> {
        const progress = new Subject<number>();
        progress.next(0);
        const userData = update[0].userData as IUserData;
        this.userRef.collection('userData').doc('profile').update({
            about: userData.profile.about,
            fName: userData.profile.fName,
            lName: userData.profile.lName,
            location: userData.profile.location
        }).then(() => true, error => { throw new Error(error); }).then(res => {
            if (res && update[1]) {
                progress.next(50);
                this.userRef.collection('userData').doc('tags').update(userData.tags).then(() => {
                    progress.next(100);
                }, error => {
                    throw new Error(error);
                });
            } else progress.next(100);
        }).catch(error => {
            console.error('Error while updating user', error);
            progress.next(-1);
            });
        return progress;
    }

    updateProfileData(update: IUpdateProfile): Observable<number> {
        const progress = new Subject<number>();
        progress.next(0);
        this.userRef.collection('userData').doc('profile').update({
            email: update.email
        }).then(() => true, error => { throw new Error(error); }).then(res => {
            progress.next(25);
            if (res) {
                progress.next(30);
                return this.fireAuth.auth.fetchSignInMethodsForEmail(this.user.email).then((providers: string[]) => {
                    progress.next(40);
                    if (providers.includes('password'))
                        return this.user.updateEmail(update.email).then(val => {
                            progress.next(60);
                            if (update.pass)
                                return this.user.updatePassword(update.pass).then(() => {
                                    progress.next(90);
                                }, error => { throw new Error(error); });
                        });
                    console.log(providers); // password | google.com
                });
            }
        }).then(() => {
            progress.next(100);
        }).catch(error => {
            progress.next(-1);
        });
        return progress;
    }
//#endregion

    isAuthenticated(): Observable<boolean> {
        return this._isAuth.asObservable();
    }

//#region get user
    getUser(): Promise<IUser> {
        console.log('get user');
        // console.log('get user', this.userRef);
        return this.userRef.get().then(userSnap => {
            if (userSnap.exists) {
                this._token = userSnap.id;
                return userSnap.ref.collection('userData').doc('profile').get().then(profileSnap => {
                    if (profileSnap.exists) {
                        const profileData: IProfile = <any>profileSnap.data();
                        return (profileData.location as DocumentReference).get().then(locSnap => {
                            if (locSnap.exists)
                                return <any>locSnap.data();
                            else {
                                this.noProfileError('Cannot accquire profile location for profile');
                                return { location: '<ERROR!>', nav: new firestore.GeoPoint(0, 0) };
                            }
                        }).then((loc: { location: string, nav: firestore.GeoPoint }) => {
                            profileData.location = loc;
                            return profileData;
                        });
                    } else {
                        this.noProfileError();
                        return {
                            about: 'ERROR',
                            email: 'ERROR',
                            fName: 'ERROR',
                            lName: 'ERROR',
                            location: { location: 'ERROR', nav: new firestore.GeoPoint(0, 0) }
                        };
                    }
                }).then(user => {
                    return userSnap.ref.collection('userData').doc('tags').get().then(tagsSnap => {
                        if (tagsSnap.exists)
                            return { profile: user, tags: <ITags><any>tagsSnap.data() };
                        else {
                            this.noProfileError('Cannot accquire profile location for profile');
                            return { profile: user, tags: {passions: [], paymentForm: [], skills: []} };
                        }
                    });
                    }).then(userData => {
                        const tmpUser: IUser = <any>userSnap.data();
                        const tmpData = userData;
                        tmpData.tags.skills = tmpUser.skills = userData.tags.skills ? userData.tags.skills : [];
                        tmpData.tags.passions = tmpUser.passions = userData.tags.passions ? userData.tags.passions : [];
                        tmpUser.userData = tmpData;
                        // const storageRef = this.fireStorage.ref(`img/user/${this.userRef}/else.jpg`);
                        if (!tmpUser.imgUrl) {
                            tmpUser.imgUrl = { else: placeholderUrl };
                            return tmpUser;
                        }
                        return this.fireStorage.storage
                            .refFromURL(tmpUser.imgUrl as string)
                            .getDownloadURL().then((url: string) => {
                                // tmpUser.imgUrl = { else: url };
                                return url;
                            }, error => {
                                if (error.code === 'storage/object-not-found')
                                    this.alertService.addAlert(Alerts.noPhoto);
                                tmpUser.imgUrl = { else: placeholderUrl };
                                return null;
                            }).then(elseUrl => {
                                if (elseUrl) {
                                    const getUrl = (tmpUser.imgUrl as string).split('.');
                                    getUrl.pop();
                                    getUrl.push('webp');
                                    const webpUrl = getUrl.join('.');
                                    return this.fireStorage.storage.refFromURL(webpUrl as string)
                                        .getDownloadURL().then(url => {
                                            tmpUser.imgUrl = { else: elseUrl, webp: url };
                                            return tmpUser;
                                        }, error => {
                                            tmpUser.imgUrl = { else: elseUrl };
                                            return tmpUser;
                                        });
                                }
                                return tmpUser;
                            });
                        /*
                        if (tmpUser.imgUrl)
                            return (tmpUser.imgUrl as DocumentReference).get().then(imgSnap => {
                                if (imgSnap.exists) {
                                    const other = <any>imgSnap.data()['else'];
                                    const jpf = <any>imgSnap.data()['jpf'];
                                    const webp = <any>imgSnap.data()['webp'];
                                    tmpUser.imgUrl = <any>imgSnap.data()['else'];
                                } else {
                                    tmpUser.imgUrl = placeholderUrl;
                                    this.alertService.addAlert(Alerts.noPhoto);
                                }
                                return tmpUser;
                            });
                        else {
                            this.alertService.addAlert(Alerts.noPhoto);
                            tmpUser.imgUrl = placeholderUrl;
                            return tmpUser;
                        }
                        */
                    }).then((user: IUser) => {
                        return {
                            connections: user.connections,
                            imgUrl: user.imgUrl,
                            location: user.location,
                            name: user.name,
                            passions: user.passions,
                            skills: user.skills,
                            userData: user.userData
                        };
                    });
            } else throw new Error('Cannot get current user');
        }).then((user: IUser) => {
            this.currentUser = user;
            this.currentData = (user.userData as IUserData);
            this.getCommunities();
            return user;
        }).catch(error => {
            this.noProfileError();
            console.log(error);
            return null;
        });
    }

    private getCommunities() {
        this.userRef.collection('communities').get().then(comsSnap => {
            if (!comsSnap.empty)
                comsSnap.forEach(userCom => {
                    // this.userCommunities.push(userCom.id);
                    const comRef: DocumentReference = userCom.data()['ref'];
                    comRef.get().then(com => {
                        if (com.exists)
                            return com.id;
                        else
                            throw new Error('Unable to get community data');
                    }).then(comName => {
                        this.comService.getCommunity(comName).then(comData => {
                            this.userCommunities.push(comData);
                        });
                        // this.userCommunities.
                    });
                    // this.userCommunities.
                });
            else
                this.alertService.addAlert(Alerts.noCommunity);
        });
    }

    sharedCommunity(profileRef: DocumentReference): Promise<boolean> {
        return profileRef.collection('communities').get().then(comsSnap => {
            const comIds: string[] = [];
            if (!comsSnap.empty)
                comsSnap.forEach(com => {
                    comIds.push(com.id);
                });
            return comIds;
        }).then(comIds => {
            let isInc = false;
            this.userCommunities.forEach(com => {
                if (comIds.filter(comId => com.link === comId).length > 0)
                    isInc = true;
            });
            return isInc;
        }).then(isInc => isInc).catch(error => {
            this.alertService.addAlert(Alerts.custom, error);
            console.log(error);
            return null;
        });
    }

    private noProfileError(error?: string) {
        if (!error) {
            this.alertService.addAlert(Alerts.incomplete); // TODO: add restriction here or in servvice
            this.isAuth = false;
        } else
            this.alertService.addAlert(Alerts.custom, {
                msg: error,
                type: 'warning'
            });
    }

    private getChats() {
        this.userRef.collection('messages').orderBy('timestamp').onSnapshot(mesSnap => {
            const mesChanges = mesSnap.docChanges();
            mesChanges.forEach(mes => {
                const chatRef: DocumentReference = mes.doc.data()['ref'];
                const timestamp = mes.doc.data()['timestamp'];
                let hasNew = false;
                const tmpChats = this._userChats.getValue();
                if (mes.doc.data()['newMessage'])
                    hasNew = true;
                const tmpIndex = tmpChats.map(tc => tc.ref.id).indexOf(chatRef.id);
                const Prom = new Promise<Chat[]>((resolve, reject) => {
                    if (tmpIndex > -1) {
                        tmpChats[tmpIndex].newMessage = hasNew;
                        tmpChats[tmpIndex].timestamp = timestamp;
                        if (hasNew)
                            this.alertService.addAlert(Alerts.newMessage, tmpChats[tmpIndex]);
                        resolve(tmpChats);
                    } else
                        resolve(
                            this.getChat(chatRef, timestamp, hasNew).catch(error => {
                                this.alertService.addAlert(Alerts.messageError, error);
                                reject(error);
                            }).then(chat => {
                                if (chat)
                                    tmpChats.push(chat);
                            }).then(() => tmpChats)
                        );
                }).then(tChat => {
                    const sorted = tChat.sort((a, b) => {
                        return b.timestamp.seconds - a.timestamp.seconds;
                    });
                    this._userChats.next(tChat);
                });
            });
        }, error => {
            this.alertService.addAlert(Alerts.messageError, error);
        });
    }

    getChat(ref: DocumentReference, timestamp: firestore.Timestamp = null, hasNew = false): Promise<Chat> {
        return ref.get().then(chatSnap => {
            if (chatSnap.exists)
                return new Chat(this.db, this, this.comService,
                    chatSnap as DocumentSnapshot<IChat>, timestamp, hasNew);
            else return null;
        }).catch(error => {
            this.alertService.addAlert(Alerts.messageError, error);
            // throw new Error(error);
            console.log(ref, this.token, error);
            return null;
        });
    }
//#endregion
}
export interface IRegister {
    type: number;
    email?: string;
    pass?: string;
    fName: string;
    lName: string;
    location: string;
    latlng: google.maps.LatLng;
    skills: string[];
    passions: string[];
    payment: Payments[];
    about: string;
    photo: boolean;
}
export interface IYourProfile {
    fName: string;
    lName: string;
    about: string;
    location: string;
    skills: string[];
    passions: string[];
    payment: number[];
}
export interface IUpdateProfile {
    email: string;
    pass?: string;
    pass1?: string;
    pass2?: string;
}

// TODO: remove this
const baxter: IUser = {
    name: 'Baxter Cochennet',
    skills: ['Accounting', 'Personal Finance', 'Budgeting', 'Photography'],
    passions: ['Cycling', 'Fly Fishing', 'Photography', 'SUP', 'Cliff Jumping', 'Community'],
    location: 'Denver',
    connections: 15,
    // tslint:disable-next-line:max-line-length
    imgUrl: `https://firebasestorage.googleapis.com/v0/b/open-garage-fb.appspot.com/o/img%2FUUiDkyLpEmr7C9Pz9pQD%2Fbaxter.jpg?alt=media&token=6ca2dd70-ae21-4470-a23b-e8f2dc50ca65`
};