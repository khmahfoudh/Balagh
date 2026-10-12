package com.example.backend.repository;

import com.example.backend.entity.User;
import com.example.backend.enums.Role;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface UserRepository extends JpaRepository<User, UUID> {
    Optional<User> findByPhone(String phone);

    boolean existsByPhone(String phone);

    Optional<User> findByNniHash(String nniHash);

    List<User> findByOrganizationIdAndRoleInOrderByLastNameAsc(UUID organizationId, Collection<Role> roles);

    List<User> findByRole(Role role);

    List<User> findAllByOrderByCreatedAtDesc();
}
