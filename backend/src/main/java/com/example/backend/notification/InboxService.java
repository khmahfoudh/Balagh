package com.example.backend.notification;

import com.example.backend.common.ApiException;
import com.example.backend.common.PageResponse;
import com.example.backend.entity.DeviceToken;
import com.example.backend.repository.DeviceTokenRepository;
import com.example.backend.repository.NotificationRepository;
import com.example.backend.repository.UserRepository;
import com.example.backend.security.CurrentUser;
import com.example.backend.web.dto.MiscDtos.DeviceRequest;
import com.example.backend.web.dto.MiscDtos.NotificationItem;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.UUID;

/** Boîte de notifications de l'utilisateur connecté et enregistrement des jetons push. */
@Service
@RequiredArgsConstructor
public class InboxService {
    private final NotificationRepository notifications;
    private final DeviceTokenRepository devices;
    private final UserRepository users;

    @Transactional(readOnly = true)
    public PageResponse<NotificationItem> list(CurrentUser me, int page, int size) {
        return PageResponse.of(notifications.findByUserIdOrderByCreatedAtDesc(me.id(), PageRequest.of(page, Math.min(size, 100))),
                n -> new NotificationItem(n.getId(), n.getType(), n.getTitle(), n.getBody(), n.getIncidentId(),
                        n.getMissionId(), n.getReadAt(), n.getCreatedAt()));
    }

    @Transactional(readOnly = true)
    public long unread(CurrentUser me) {
        return notifications.countByUserIdAndReadAtIsNull(me.id());
    }

    @Transactional
    public void markRead(CurrentUser me, UUID id) {
        notifications.findById(id).filter(n -> n.getUser().getId().equals(me.id()))
                .orElseThrow(() -> ApiException.notFound("Notification"))
                .setReadAt(Instant.now());
    }

    @Transactional
    public void markAllRead(CurrentUser me) {
        notifications.markAllRead(me.id(), Instant.now());
    }

    /** Un jeton appartient au dernier compte connecté sur le téléphone. */
    @Transactional
    public void registerDevice(CurrentUser me, DeviceRequest req) {
        DeviceToken token = devices.findByToken(req.token()).orElseGet(DeviceToken::new);
        token.setToken(req.token());
        token.setUser(users.getReferenceById(me.id()));
        token.setPlatform(req.platform());
        token.setApp(req.app());
        token.setLastSeenAt(Instant.now());
        devices.save(token);
    }
}
