import { Injectable } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivate, Router } from '@angular/router';
import { CommunityService } from './community.service';

@Injectable()
export class CommunityGuardService implements CanActivate {
    constructor(private comService: CommunityService, private router: Router) {

    }

    canActivate(route: ActivatedRouteSnapshot) {
        const exists = this.comService.getCommunity(route.params['id']);
        if (!exists)
            this.router.navigate(['/community/404']);
        return exists;
    }
}