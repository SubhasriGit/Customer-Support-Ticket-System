Feature: Customer Support Ticket Management
  As a support team member
  I want to manage customer support tickets
  So that I can resolve customer issues efficiently

  Background:
    Given I am on the support portal

  Scenario: Submit a new support ticket
    When I fill in the ticket title with "Login page broken"
    And I fill in the ticket email with "user@example.com"
    And I fill in the ticket description with "Cannot log in after password reset."
    And I submit the ticket
    Then I should see "Login page broken" in the ticket list

  Scenario: Toggle ticket status from open to closed
    When I fill in the ticket title with "Status test ticket"
    And I fill in the ticket email with "qa@example.com"
    And I fill in the ticket description with "Testing status toggle."
    And I submit the ticket
    And I close the ticket "Status test ticket"
    Then the ticket "Status test ticket" should show status "closed"

  Scenario: Filter tickets by closed status
    When I filter tickets by "closed" status
    Then I should see no open tickets
