import { Component, OnInit, Inject, ViewChild, AfterViewInit } from '@angular/core';
import { MatDialogRef, MAT_DIALOG_DATA, MatChipInputEvent, MatChipList, MatDialog } from '@angular/material';
import { IUser, Payments, IProfile, IUserData } from '../../community/community-interfaces';
import { ENTER, COMMA } from '@angular/cdk/keycodes';
import { FormGroup, FormBuilder, Validators } from '@angular/forms';
import { MyErrorStateMatcher } from '../../../pages/register-page/ragister-validator';
import { firestore } from 'firebase/app';
import { ImageDialogComponent } from '../image-dialog/image-dialog.component';

@Component({
    selector: 'app-your-profile-dialog',
    templateUrl: './your-profile-dialog.component.html',
    styleUrls: ['./your-profile-dialog.component.scss']
})
export class YourProfileDialogComponent implements OnInit, AfterViewInit {

    payments: string[] = [];
    // profile: IUser;
    profilePayments: string[] = [];
    @ViewChild('skillsList') skillsList: MatChipList;
    @ViewChild('passionsList') passionsList: MatChipList;
    olds: any;
    change = false;
    matcher = new MyErrorStateMatcher();
    uFormGroup: FormGroup;

    constructor(
        private fb: FormBuilder,
        public dialogRef: MatDialogRef<YourProfileDialogComponent>,
        @Inject(MAT_DIALOG_DATA) public profile: IUser, private dialog: MatDialog) {
        const tags = (this.profile.userData as IUserData).tags;
        this.olds = {
            passions: tags.passions.slice(),
            paymentForm: tags.paymentForm.slice(),
            skills: tags.skills.slice()
        };
        for (const i in Payments)
            if (typeof Payments[i] === 'string')
                this.payments.push(Payments[i]);
    }

    ngOnInit() {
        this.buildForm();
        (this.profile.userData as IUserData).tags.paymentForm.forEach(paym => {
            this.profilePayments.push(Payments[paym]);
        });
    }

    buildForm() {
        this.uFormGroup = this.fb.group({
            fName: ['', Validators.required],
            lName: ['', Validators.required],
            about: ['', Validators.required],
            location: ['', Validators.required],
            skills: '',
            passions: '',
            payment: ['', Validators.required],
        });
    }

    getError(child: string, errType: string): boolean {
        const isRequired = this.uFormGroup.get(child).hasError('required');
        if (errType === 'required')
            return isRequired;
        else
            return isRequired ? false : this.uFormGroup.get(child).hasError(errType);
    }

    ngAfterViewInit() {
        this.skillsList.chips.changes.subscribe(() => {
            if (this.skillsList.empty)
                this.uFormGroup.get('skills').setErrors({ required: true });
            // this.skills.setErrors({ required: true });
        });
        this.passionsList.chips.changes.subscribe(() => {
            if (this.passionsList.empty)
                this.uFormGroup.get('passions').setErrors({ required: true });
            // this.passions.setErrors({ required: true });
        });
    }

    addChip(event: MatChipInputEvent, type: number): void {
        const input = event.input;
        const value = event.value;

        // console.log(this.skills.value);
        if ((value || '').trim())
            if (type)
                this.profile.passions.push(value.trim());
            else
                this.profile.skills.push(value.trim());
        if (input)
            input.value = '';
        this.change = true;
    }

    removeChip(chip: any, isPassion = false): void {
        const index = isPassion ? this.profile.passions.indexOf(chip) : this.profile.skills.indexOf(chip);
        if (index >= 0)
            if (isPassion)
                this.profile.passions.splice(index, 1);
            else
                this.profile.skills.splice(index, 1);
        this.change = true;
    }

    closeDialog() {
        this.dialogRef.close('test');
    }

    openPhoto() {
        const dialogRef = this.dialog.open(ImageDialogComponent, { data: { profile: this.profile, need: false } });
        dialogRef.afterClosed().subscribe(result => {
            console.log(result);
        });
}

    submitRegister(formValue): [IUser, boolean] {
        const formUser: IUser = this.profile;
        formUser.passions = this.profile.passions ? this.profile.passions : [];
        formUser.skills = this.profile.skills ? this.profile.skills : [];
        const userLocation = (this.profile.userData as IUserData).profile.location as { location: string, nav: firestore.GeoPoint };
        (formUser.userData as IUserData).profile.location = {
            location: this.profile.location,
            nav: userLocation.nav
        };
        if (this.change) {
            const payments: number[] = [];
            this.profilePayments.forEach(payment => {
                payments.push(Payments[payment]);
            });
            (formUser.userData as IUserData).tags.passions = formUser.passions;
            (formUser.userData as IUserData).tags.paymentForm = payments;
            (formUser.userData as IUserData).tags.skills = formUser.skills;
        }
        return [formUser, this.change];
        // TODO: add close also add other update qualifier?
    }

}
