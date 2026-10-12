package com.example.backend.config;

import io.swagger.v3.oas.models.Components;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.security.SecurityRequirement;
import io.swagger.v3.oas.models.security.SecurityScheme;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/** Documentation interactive : http://localhost:8080/swagger-ui.html */
@Configuration
public class OpenApiConfig {

    @Bean
    OpenAPI balaghOpenApi() {
        return new OpenAPI()
                .info(new Info().title("Balagh MR API").version("v1")
                        .description("Plateforme nationale de signalement : citoyens, organismes, chauffeurs, État."))
                .components(new Components().addSecuritySchemes("bearer",
                        new SecurityScheme().type(SecurityScheme.Type.HTTP).scheme("bearer").bearerFormat("JWT")))
                .addSecurityItem(new SecurityRequirement().addList("bearer"));
    }
}
