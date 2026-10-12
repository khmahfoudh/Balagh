package com.example.backend.service;

import com.example.backend.common.ApiException;
import com.example.backend.common.ErrorCode;
import com.example.backend.entity.Mission;
import com.example.backend.entity.Organization;
import com.example.backend.entity.User;
import com.example.backend.enums.OrgStatus;
import com.example.backend.enums.Role;
import com.example.backend.repository.MissionRepository;
import com.example.backend.repository.OrganizationRepository;
import com.example.backend.repository.RefreshTokenRepository;
import com.example.backend.repository.UserRepository;
import com.example.backend.security.CurrentUser;
import com.example.backend.web.DtoMapper;
import com.example.backend.web.dto.UserDtos.AdminCreateUserRequest;
import com.example.backend.web.dto.UserDtos.AdminUpdateUserRequest;
import com.example.backend.web.dto.UserDtos.InvitationResponse;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** Gestion des comptes par l'admin : création (invitation ou mot de passe) et modification. */
@ExtendWith(MockitoExtension.class)
class AdminUserServiceTest {
    @Mock UserRepository users;
    @Mock OrganizationRepository organizations;
    @Mock MissionRepository missions;
    @Mock RefreshTokenRepository refreshTokens;
    @Mock UserService userService;
    @Mock PasswordEncoder passwordEncoder;
    @Mock AuditService audit;
    @Mock DtoMapper mapper;
    @InjectMocks AdminUserService service;

    private final CurrentUser admin = new CurrentUser(UUID.randomUUID(), Role.ADMIN, null);

    private static Organization org(OrgStatus status) {
        Organization o = new Organization();
        o.setId(UUID.randomUUID());
        o.setName("Organisme test");
        o.setStatus(status);
        return o;
    }

    private static User user(Role role, Organization org) {
        User u = new User();
        u.setId(UUID.randomUUID());
        u.setFirstName("Moussa");
        u.setLastName("Ba");
        u.setPhone("+22221000003");
        u.setRole(role);
        u.setOrganization(org);
        return u;
    }

    @Test
    void creationAvecMotDePasseActiveLeCompteEtLOrganismeDuResponsable() {
        Organization o = org(OrgStatus.INVITED);
        when(organizations.findById(o.getId())).thenReturn(Optional.of(o));
        when(passwordEncoder.encode("MotDePasse1")).thenReturn("hash");

        service.create(admin, new AdminCreateUserRequest("Ahmed", "Salem", "22000099", Role.MANAGER, o.getId(), null, "MotDePasse1"));

        ArgumentCaptor<User> saved = ArgumentCaptor.forClass(User.class);
        verify(users).save(saved.capture());
        assertThat(saved.getValue().getPhone()).isEqualTo("+22222000099");
        assertThat(saved.getValue().getPasswordHash()).isEqualTo("hash");
        assertThat(saved.getValue().getOrganization()).isSameAs(o);
        assertThat(o.getStatus()).isEqualTo(OrgStatus.ACTIVE);
        verify(userService, never()).createInvitation(any(), any(), any(), any(), any(), any(), any());
    }

    @Test
    void creationSansMotDePasseEnvoieUneInvitation() {
        when(userService.createInvitation(any(), any(), any(), any(), eq(Role.AUTHORITY), eq(null), eq(admin.id())))
                .thenReturn(new InvitationResponse(UUID.randomUUID(), "+22220000099", Role.AUTHORITY, "A", "B", Instant.now(), "lien"));

        var response = service.create(admin, new AdminCreateUserRequest("A", "B", "20000099", Role.AUTHORITY, null, null, null));

        assertThat(response.invitation()).isNotNull();
        assertThat(response.user()).isNull();
        verify(users, never()).save(any());
    }

    @Test
    void refusCitoyenOuAgentSansOrganisme() {
        assertThatThrownBy(() -> service.create(admin, new AdminCreateUserRequest("A", "B", "30000099", Role.CITIZEN, null, null, "MotDePasse1")))
                .isInstanceOf(ApiException.class);
        assertThatThrownBy(() -> service.create(admin, new AdminCreateUserRequest("A", "B", "22000098", Role.AGENT, null, null, "MotDePasse1")))
                .isInstanceOf(ApiException.class).hasMessageContaining("organisme");
    }

    @Test
    void changementDeRoleRevoqueLesSessionsEtRetireLOrganismePourLEtat() {
        User agent = user(Role.AGENT, org(OrgStatus.ACTIVE));
        when(users.findById(agent.getId())).thenReturn(Optional.of(agent));

        service.update(admin, agent.getId(), new AdminUpdateUserRequest(null, null, null, Role.AUTHORITY, null, null));

        assertThat(agent.getRole()).isEqualTo(Role.AUTHORITY);
        assertThat(agent.getOrganization()).isNull();
        verify(refreshTokens).revokeAllForUser(eq(agent.getId()), any());
        verify(audit).log(eq(admin.id()), eq("USER_UPDATED"), eq("USER"), eq(agent.getId()), eq("rôle/organisme"));
    }

    @Test
    void unChauffeurEnMissionNeChangePasDOrganisme() {
        User driver = user(Role.DRIVER, org(OrgStatus.ACTIVE));
        Organization other = org(OrgStatus.ACTIVE);
        when(users.findById(driver.getId())).thenReturn(Optional.of(driver));
        when(missions.findByDriverIdAndStatusIn(eq(driver.getId()), any())).thenReturn(List.of(new Mission()));

        assertThatThrownBy(() -> service.update(admin, driver.getId(),
                new AdminUpdateUserRequest(null, null, null, null, other.getId(), null)))
                .isInstanceOfSatisfying(ApiException.class, e -> assertThat(e.code()).isEqualTo(ErrorCode.CONFLICT));
    }

    @Test
    void lAdminNeChangePasSonPropreRoleMaisPeutChangerSonNom() {
        User me = user(Role.ADMIN, null);
        me.setId(admin.id());
        when(users.findById(admin.id())).thenReturn(Optional.of(me));

        assertThatThrownBy(() -> service.update(admin, admin.id(), new AdminUpdateUserRequest(null, null, null, Role.AGENT, null, null)))
                .isInstanceOf(ApiException.class);

        service.update(admin, admin.id(), new AdminUpdateUserRequest("Nouveau", null, null, null, null, null));
        assertThat(me.getFirstName()).isEqualTo("Nouveau");
        verify(refreshTokens, never()).revokeAllForUser(any(), any());
    }
}
