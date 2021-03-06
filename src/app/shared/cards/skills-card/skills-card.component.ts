import { Component, Input, ViewChild, ElementRef } from '@angular/core';
import { CommunityService } from '../../community/community.service';
import { ICommunitySkills, IUser, CommunitySearchType } from '../../community/community-interfaces';

@Component({
    selector: 'app-skills-card',
    templateUrl: './skills-card.component.html',
    styleUrls: ['./skills-card.component.scss']
})
export class SkillsCardComponent {

    @Input('skill') skill: string;
    @Input('profiles') profiles: IUser[];
    hoverNumber = -1;

    constructor(private comService: CommunityService) { }

    cardClick() {
        this.comService.updateSearch([], [this.skill], this.skill, CommunitySearchType.skillsSkills);
    }
    nameClick(profile) {
        this.comService.updateSearch([profile], [], profile, CommunitySearchType.skillsMembers);
    }

    mouseOver(i: number) {
        this.hoverNumber = i;
    }
    mouseOut(i: number) {
        this.hoverNumber = -1;
    }

}
