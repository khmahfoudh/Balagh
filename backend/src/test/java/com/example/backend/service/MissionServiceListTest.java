package com.example.backend.service;

import com.example.backend.enums.MissionStatus;
import com.example.backend.enums.Role;
import com.example.backend.repository.MissionRepository;
import com.example.backend.security.CurrentUser;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;

import java.util.Collection;
import java.util.EnumSet;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** Écran « Missions » : isolation par organisme, tri et bornes de pagination. */
@ExtendWith(MockitoExtension.class)
class MissionServiceListTest {
    @Mock
    MissionRepository missions;
    @InjectMocks
    MissionService service;

    @Test
    void unAgentNeVoitQueLesMissionsDeSonOrganisme() {
        UUID org = UUID.randomUUID();
        when(missions.search(any(), any(), any(), any())).thenReturn(Page.empty());

        service.list(new CurrentUser(UUID.randomUUID(), Role.AGENT, org), List.of(MissionStatus.ASSIGNED), null, 0, 20);

        verify(missions).search(eq(org), eq(List.of(MissionStatus.ASSIGNED)), isNull(), any());
    }

    @Test
    void lAdminVoitToutesLesMissionsEtTousLesStatutsParDefaut() {
        when(missions.search(any(), any(), any(), any())).thenReturn(Page.empty());
        @SuppressWarnings("unchecked")
        ArgumentCaptor<Collection<MissionStatus>> statuses = ArgumentCaptor.forClass(Collection.class);
        ArgumentCaptor<Pageable> page = ArgumentCaptor.forClass(Pageable.class);

        service.list(new CurrentUser(UUID.randomUUID(), Role.ADMIN, null), null, null, -3, 5000);

        verify(missions).search(isNull(), statuses.capture(), isNull(), page.capture());
        assertThat(statuses.getValue()).containsExactlyInAnyOrderElementsOf(EnumSet.allOf(MissionStatus.class));
        assertThat(page.getValue().getPageNumber()).isZero();
        assertThat(page.getValue().getPageSize()).isEqualTo(100);
        assertThat(page.getValue().getSort().getOrderFor("assignedAt").getDirection()).isEqualTo(Sort.Direction.DESC);
    }
}
